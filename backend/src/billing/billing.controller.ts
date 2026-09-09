import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ensureUserRecord } from '../users/ensure-user';
import { AuditLogService } from '../audit-log/audit-log.service';
import { allocatePaymentFifo } from './payment-allocation';
import { serializePayment } from '../contracts/serializers';
import { zodErrorMessage } from '../i18n/zod-error-message';
import { Accounting1cPushService } from './accounting-1c-push.service';
import { ServiceProvisionDocService } from './service-provision-doc.service';
import { PenaltyRecalculateService } from './penalty-recalculate.service';

const createPaymentSchema = z.object({
  amount: z.number().finite().positive(),
  paidAt: z.coerce.date(),
  method: z.enum(['CASH', 'CARD_ACQUIRING', 'BANK_TRANSFER', 'MAT_CAPITAL', 'WEBSITE']),
  rawComment: z.string().trim().min(1).nullish(),
});

const serviceProvisionDocumentIdsSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(100),
});

const AUDITED_PAYMENT_FIELDS = ['amount', 'paidAt', 'method', 'source', 'rawComment', 'reversedAt'];

interface RawServiceProvisionDetail {
  SiteContractID?: number;
  ContractNumber?: string;
  ResidentIndividualUID?: string;
  ResidentFullName?: string;
  ContractorUID?: string | null;
  ContractUID?: string | null;
  SummDetails: number;
  Accounting1cMatched?: boolean;
  MissingMappings?: ('CONTRACTOR' | 'CONTRACT')[];
}

function serviceProvisionDetails(rawPayload: Prisma.JsonValue): RawServiceProvisionDetail[] {
  const raw = rawPayload as { DocumentSummDetails?: RawServiceProvisionDetail[] } | null;
  return Array.isArray(raw?.DocumentSummDetails) ? raw.DocumentSummDetails : [];
}

function parseIdParam(idParam: string): number {
  const id = Number.parseInt(idParam, 10);
  if (!Number.isInteger(id)) {
    throw new BadRequestException('contracts.errors.invalidId');
  }
  return id;
}

@Controller()
@UseGuards(AuthGuard, RolesGuard)
@Roles('STAFF', 'ADMIN')
export class BillingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly accounting1cPush: Accounting1cPushService,
    private readonly serviceProvisionDoc: ServiceProvisionDocService,
    private readonly penaltyRecalculate: PenaltyRecalculateService,
  ) {}

  // Ручной платёж (сотрудник вносит) — сразу разносится по неоплаченным начислениям
  // (FIFO, самое старое первым, см. billing/payment-allocation.ts). Источник — всегда
  // MANUAL: импорт из 1С и оплата на сайте — отдельные, ещё не реализованные потоки
  // (см. дизайн-документ), это не тот же эндпоинт.
  @Post('contracts/:contractId/payments')
  async createPayment(@Param('contractId') contractIdParam: string, @Body() body: unknown, @Req() req: Request) {
    const contractId = parseIdParam(contractIdParam);
    const parsed = createPaymentSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(zodErrorMessage(parsed.error));
    }
    if (!req.user) {
      throw new BadRequestException('contracts.errors.sessionUserNotFound');
    }

    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) {
      throw new NotFoundException('contracts.errors.contractNotFound');
    }

    const amount = new Prisma.Decimal(parsed.data.amount);
    return this.prisma.$transaction(async (tx) => {
      const createdByUserId = await ensureUserRecord(tx, req.user!);
      const payment = await tx.payment.create({
        data: {
          contractId,
          amount,
          paidAt: parsed.data.paidAt,
          method: parsed.data.method,
          source: 'MANUAL',
          rawComment: parsed.data.rawComment ?? null,
          createdByUserId,
        },
      });
      await allocatePaymentFifo(tx, contractId, payment.id, amount, parsed.data.paidAt);

      await this.auditLog.log(tx, {
        userId: createdByUserId,
        action: 'CREATE',
        entityType: 'Payment',
        entityId: payment.id,
        entityLabel: `Платёж по договору №${contract.number}`,
        before: null,
        after: payment,
        fields: AUDITED_PAYMENT_FIELDS,
      });

      return serializePayment(payment);
    });
  }

  // Сторно — платёж внесён ошибочно. Не удаляем сам Payment (остаётся с reversedAt для
  // истории), но снимаем его разнесение — начисления сразу же снова видны как неоплаченные.
  @Post('payments/:paymentId/reverse')
  async reversePayment(@Param('paymentId') paymentIdParam: string, @Req() req: Request) {
    const paymentId = parseIdParam(paymentIdParam);
    if (!req.user) {
      throw new BadRequestException('contracts.errors.sessionUserNotFound');
    }
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { contract: { select: { number: true } } } });
    if (!payment) {
      throw new NotFoundException('billing.errors.paymentNotFound');
    }
    if (payment.reversedAt) {
      throw new BadRequestException('billing.errors.paymentAlreadyReversed');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.paymentAllocation.deleteMany({ where: { paymentId } });
      const updated = await tx.payment.update({ where: { id: paymentId }, data: { reversedAt: new Date() } });

      const userId = await ensureUserRecord(tx, req.user!);
      await this.auditLog.log(tx, {
        userId,
        action: 'UPDATE',
        entityType: 'Payment',
        entityId: updated.id,
        entityLabel: `Платёж по договору №${payment.contract.number}`,
        before: payment,
        after: updated,
        fields: AUDITED_PAYMENT_FIELDS,
      });

      return serializePayment(updated);
    });
  }

  // Ручной повтор отправки в 1С Бухгалтерию (флоу 1) — та же логика, что и ночной крон
  // (accounting-1c-push.scheduler.ts), но на один конкретный платёж, для случая, когда
  // сотрудник не хочет ждать следующего ночного прогона после ошибки/правки на стороне 1С.
  // Пишем в историю изменений — это явное действие сотрудника, не фоновый крон.
  @Post('payments/:paymentId/sync-to-1c')
  async syncPaymentToAccounting1c(@Param('paymentId') paymentIdParam: string, @Req() req: Request) {
    const paymentId = parseIdParam(paymentIdParam);
    if (!req.user) {
      throw new BadRequestException('contracts.errors.sessionUserNotFound');
    }
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { contract: { select: { number: true } } } });
    if (!payment) {
      throw new NotFoundException('billing.errors.paymentNotFound');
    }
    if (payment.source !== 'WEBSITE') {
      throw new BadRequestException('billing.errors.paymentNotWebsiteSource');
    }

    await this.accounting1cPush.pushPayments([paymentId]);
    const updated = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });

    const userId = await ensureUserRecord(this.prisma, req.user);
    await this.auditLog.log(this.prisma, {
      userId,
      action: 'UPDATE',
      entityType: 'Payment',
      entityId: updated.id,
      entityLabel: `Отправка в 1С — платёж по договору №${payment.contract.number}`,
      before: payment,
      after: updated,
      fields: ['accounting1cSyncStatus', 'accounting1cDocumentUid', 'accounting1cSyncError'],
    });

    return serializePayment(updated);
  }

  // Ручной пересчёт пени по кнопке сотрудника (2026-09-05) — полная пересборка журнала
  // пени договора с нуля тем же дневным расчётом, что и ночной крон (penalty-calc.ts),
  // см. penalty-recalculate.service.ts. Нужен, чтобы поправить историю пени у договоров,
  // которую крон уже успел неверно посчитать (например, до фикса в тот же день — задним
  // числом занесённый договор получал пеню от максимального долга сразу за весь
  // пропущенный период) — сам крон такую историю задним числом не переиграет, он только
  // идёт вперёд от Contract.penaltyAccruedThrough.
  @Post('contracts/:contractId/recalculate-penalty')
  async recalculatePenalty(@Param('contractId') contractIdParam: string, @Req() req: Request) {
    const contractId = parseIdParam(contractIdParam);
    if (!req.user) {
      throw new BadRequestException('contracts.errors.sessionUserNotFound');
    }
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) {
      throw new NotFoundException('contracts.errors.contractNotFound');
    }

    const { rowsCreated, totalAdded } = await this.penaltyRecalculate.recalculate(contractId);
    const updated = await this.prisma.contract.findUniqueOrThrow({ where: { id: contractId } });

    const userId = await ensureUserRecord(this.prisma, req.user);
    await this.auditLog.log(this.prisma, {
      userId,
      action: 'UPDATE',
      entityType: 'Contract',
      entityId: contract.id,
      entityLabel: `Пересчёт пени — договор №${contract.number}`,
      before: contract,
      after: updated,
      fields: ['penaltyAccruedThrough'],
    });

    return { rowsCreated, totalAdded: Number(totalAdded) };
  }

  // Флоу 3 — видимость сотруднику: что реально отправилось за какой месяц и с каким
  // статусом (без похода в БД/логи контейнера). Без пагинации — по два документа на
  // месяц (Найм/Коммуналка), даже за несколько лет это небольшой список.
  //
  // GET только читает сохранённые документы. Создание и обновление выполняют планировщик
  // и отдельная ручка пересчёта, поэтому открытие страницы не запускает тяжёлый расчёт.
  @Get('service-provision-documents')
  async listServiceProvisionDocuments() {
    const rows = await this.prisma.serviceProvisionDocument.findMany({ orderBy: [{ periodStart: 'desc' }, { type: 'asc' }], take: 100 });
    // rawPayload нужен здесь только для счётчика несопоставленных строк и намеренно не
    // уходит клиенту. Поэтому вход на страницу не загружает состав всех документов;
    // строки конкретного документа запрашиваются только при открытии его карточки.
    return rows.map((row) => {
      const details = serviceProvisionDetails(row.rawPayload);
      return {
        id: row.id,
        periodStart: row.periodStart,
        type: row.type,
        documentSumm: Number(row.documentSumm),
        contractCount: row.contractCount,
        unmatchedContractCount: details.filter((detail) =>
          detail.Accounting1cMatched === false || !detail.ContractorUID || !detail.ContractUID,
        ).length,
        accounting1cSyncStatus: row.accounting1cSyncStatus,
        accounting1cDocumentUid: row.accounting1cDocumentUid,
        accounting1cSyncError: row.accounting1cSyncError,
        accounting1cSyncedAt: row.accounting1cSyncedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });
  }

  // Детализация одного документа — какие именно договоры и на какую сумму попали в
  // сводную цифру (по прямой просьбе 2026-09-04, "детально показывать какие договора
  // попали в этот документ"). Новые строки содержат наш contractId, номер, ФИО и признак
  // сопоставления с 1С. Для старых сохранённых документов поддерживаем прежний формат и
  // по возможности резолвим договор обратно по ContractUID.
  @Get('service-provision-documents/:id')
  async getServiceProvisionDocument(@Param('id') idParam: string) {
    const id = parseIdParam(idParam);
    const doc = await this.prisma.serviceProvisionDocument.findUnique({ where: { id } });
    if (!doc) {
      throw new NotFoundException('billing.errors.serviceProvisionDocumentNotFound');
    }

    const details = serviceProvisionDetails(doc.rawPayload);
    const contractIds = details.map((detail) => detail.SiteContractID).filter((value): value is number => Number.isInteger(value));
    const contractUids = details.map((detail) => detail.ContractUID).filter((value): value is string => typeof value === 'string');
    const contracts = contractIds.length || contractUids.length
      ? await this.prisma.contract.findMany({
          where: {
            OR: [
              ...(contractIds.length ? [{ id: { in: contractIds } }] : []),
              ...(contractUids.length ? [{ accounting1cUid: { in: contractUids } }] : []),
            ],
          },
          select: { id: true, number: true, residentIndividualUid: true, accounting1cUid: true, resident: { select: { fullName: true } } },
        })
      : [];
    const contractById = new Map(contracts.map((contract) => [contract.id, contract]));
    const contractByUid = new Map(contracts.map((c) => [c.accounting1cUid, c]));

    const lines = details.map((d) => {
      const contract = (d.SiteContractID ? contractById.get(d.SiteContractID) : undefined) ??
        (d.ContractUID ? contractByUid.get(d.ContractUID) : undefined);
      const missingMappings = d.MissingMappings ?? [
        ...(!d.ContractorUID ? ['CONTRACTOR' as const] : []),
        ...(!d.ContractUID ? ['CONTRACT' as const] : []),
      ];
      return {
        contractId: d.SiteContractID ?? contract?.id ?? null,
        contractNumber: d.ContractNumber ?? contract?.number ?? null,
        residentIndividualUid: d.ResidentIndividualUID ?? contract?.residentIndividualUid ?? null,
        residentFullName: d.ResidentFullName ?? contract?.resident.fullName ?? null,
        amount: d.SummDetails,
        accounting1cMatched: d.Accounting1cMatched ?? missingMappings.length === 0,
        missingMappings,
      };
    });

    return {
      ...doc,
      documentSumm: Number(doc.documentSumm),
      unmatchedContractCount: lines.filter((line) => !line.accounting1cMatched).length,
      lines,
    };
  }

  @Post('service-provision-documents/recalculate')
  async recalculateServiceProvisionDocuments(@Body() body: unknown) {
    const parsed = serviceProvisionDocumentIdsSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(zodErrorMessage(parsed.error));
    return this.serviceProvisionDoc.recalculateDocuments(parsed.data.ids);
  }

  // Ручная отправка ровно выбранных сохранённых документов. Пересчёт остаётся отдельным
  // явным действием, чтобы пользователь видел и подтверждал конкретные период и сумму.
  @Post('service-provision-documents/run')
  async runServiceProvisionDocuments(@Body() body: unknown) {
    const parsed = serviceProvisionDocumentIdsSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(zodErrorMessage(parsed.error));
    return this.serviceProvisionDoc.sendDocuments(parsed.data.ids);
  }
}
