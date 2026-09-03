import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ensureUserRecord } from '../users/ensure-user';
import { AuditLogService } from '../audit-log/audit-log.service';
import { allocatePaymentFifo } from '../billing/payment-allocation';
import { serializePayment } from '../contracts/serializers';
import { zodErrorMessage } from '../i18n/zod-error-message';
import { listPaymentImports, paymentImportsFacetValues } from './payment-imports-list';
import { parsePaymentImportCandidate } from './payment-import-candidate';
import { buildPaymentPurpose } from '../billing/payment-purpose';

const approveSchema = z.object({
  contractId: z.number().int().positive(),
  method: z.enum(['CASH', 'CARD_ACQUIRING', 'BANK_TRANSFER', 'MAT_CAPITAL', 'WEBSITE']),
  // Переопределения — на случай, если сотрудник поправил сумму/дату при разборе
  // (человеческий фактор — 1С могла прислать не ту сумму/дату, см. промпт проекта).
  amount: z.number().finite().positive().optional(),
  paidAt: z.coerce.date().optional(),
});

const rejectSchema = z.object({
  reason: z.string().trim().min(1).nullish(),
});

function parseIdParam(idParam: string): number {
  const id = Number.parseInt(idParam, 10);
  if (!Number.isInteger(id)) {
    throw new BadRequestException('paymentImports.errors.invalidId');
  }
  return id;
}

// Флоу 2 (см. промпт проекта) — платежи, пришедшие мимо сайта (касса/перевод/по
// реквизитам), разбираются здесь ВСЕГДА вручную: даже однозначное на вид совпадение
// требует явного подтверждения сотрудника (см. suggest-contract-match.ts — то, что
// система предлагает, это не решение).
@Controller('payment-imports')
@UseGuards(AuthGuard, RolesGuard)
@Roles('STAFF', 'ADMIN')
export class PaymentImportsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('filters') filters?: string,
  ) {
    return listPaymentImports(this.prisma, { page, pageSize, sortBy, sortDir, filters });
  }

  @Get('facets/:field')
  async facets(@Param('field') field: string) {
    return paymentImportsFacetValues(this.prisma, field);
  }

  // Флоу 1, для того же обзорного экрана (см. промпт проекта — по прямой просьбе
  // 2026-09-03 страница показывает не только очередь на одобрение из 1С, но и наши
  // WEBSITE-платежи с их статусом отправки в 1С, единым списком). Без пагинации —
  // объём пока небольшой, фронт мёржит клиентски вместе с payment-imports (см.
  // client-list.ts) и сам режет на страницы.
  @Get('website-payments')
  async websitePayments() {
    const payments = await this.prisma.payment.findMany({
      where: { source: 'WEBSITE' },
      orderBy: { paidAt: 'desc' },
      take: 200,
      include: {
        contract: { select: { id: true, number: true, resident: { select: { fullName: true } } } },
        paymentIntent: { select: { payerFullName: true } },
        allocations: { include: { accrual: { select: { periodStart: true } } } },
      },
    });
    return payments.map((payment) => ({
      id: payment.id,
      paidAt: payment.paidAt,
      amount: Number(payment.amount),
      contractorFio: payment.contract.resident.fullName,
      contract: { id: payment.contract.id, number: payment.contract.number },
      purpose: buildPaymentPurpose({
        source: 'WEBSITE',
        residentFullName: payment.contract.resident.fullName,
        payerFullName: payment.paymentIntent?.payerFullName,
        periodStarts: payment.allocations.map((a) => a.accrual.periodStart),
        includePenalty: payment.penaltyAmount.greaterThan(0),
      }),
      accounting1cSyncStatus: payment.accounting1cSyncStatus,
      accounting1cDocumentUid: payment.accounting1cDocumentUid,
      accounting1cSyncError: payment.accounting1cSyncError,
      accounting1cSyncedAt: payment.accounting1cSyncedAt,
    }));
  }

  @Get(':id')
  async detail(@Param('id') idParam: string) {
    const id = parseIdParam(idParam);
    const record = await this.prisma.paymentImportRecord.findUnique({
      where: { id },
      include: {
        suggestedContract: { select: { id: true, number: true, resident: { select: { fullName: true } } } },
        matchedContract: { select: { id: true, number: true } },
      },
    });
    if (!record) {
      throw new NotFoundException('paymentImports.errors.notFound');
    }
    const candidate = parsePaymentImportCandidate(record.rawPayload as Record<string, unknown>);
    return {
      id: record.id,
      status: record.status,
      externalId: record.externalId,
      importedAt: record.importedAt,
      rawPayload: record.rawPayload,
      candidate,
      suggestedContract: record.suggestedContract
        ? { id: record.suggestedContract.id, number: record.suggestedContract.number, residentFullName: record.suggestedContract.resident.fullName }
        : null,
      matchedContract: record.matchedContract,
    };
  }

  // Единственный путь, которым платёж из 1С превращается в настоящий Payment леджера —
  // всегда явным подтверждением, contractId/method обязательны от сотрудника (даже если
  // suggestedContract совпадает — фронт может подставить его как дефолт в форме, но
  // сервер этого не предполагает молча).
  @Post(':id/approve')
  async approve(@Param('id') idParam: string, @Body() body: unknown, @Req() req: Request) {
    const id = parseIdParam(idParam);
    const parsed = approveSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(zodErrorMessage(parsed.error));
    }
    if (!req.user) {
      throw new BadRequestException('contracts.errors.sessionUserNotFound');
    }

    const record = await this.prisma.paymentImportRecord.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException('paymentImports.errors.notFound');
    }
    if (record.status === 'MATCHED' || record.status === 'REJECTED') {
      throw new BadRequestException('paymentImports.errors.alreadyReviewed');
    }

    const contract = await this.prisma.contract.findUnique({ where: { id: parsed.data.contractId }, select: { id: true, number: true } });
    if (!contract) {
      throw new NotFoundException('contracts.errors.contractNotFound');
    }

    const candidate = parsePaymentImportCandidate(record.rawPayload as Record<string, unknown>);
    const amount = new Prisma.Decimal(parsed.data.amount ?? candidate.amount ?? 0);
    if (amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('paymentImports.errors.amountRequired');
    }
    const paidAt = parsed.data.paidAt ?? candidate.paidAt ?? record.importedAt;

    const result = await this.prisma.$transaction(async (tx) => {
      const userId = await ensureUserRecord(tx, req.user!);
      const payment = await tx.payment.create({
        data: {
          contractId: contract.id,
          amount,
          paidAt,
          method: parsed.data.method,
          source: 'IMPORTED_1C',
          externalRef: record.externalId,
          rawComment: candidate.comment,
          createdByUserId: userId,
        },
      });
      await allocatePaymentFifo(tx, contract.id, payment.id, amount, paidAt);

      const updated = await tx.paymentImportRecord.update({
        where: { id },
        data: {
          status: 'MATCHED',
          matchedContractId: contract.id,
          resultingPaymentId: payment.id,
          reviewedByUserId: userId,
          reviewedAt: new Date(),
        },
      });

      await this.auditLog.log(tx, {
        userId,
        action: 'CREATE',
        entityType: 'Payment',
        entityId: payment.id,
        entityLabel: `Платёж из 1С по договору №${contract.number}`,
        before: null,
        after: payment,
        fields: ['amount', 'paidAt', 'method', 'source', 'rawComment'],
      });

      return { updated, payment };
    });

    return { record: result.updated, payment: serializePayment(result.payment) };
  }

  @Post(':id/reject')
  async reject(@Param('id') idParam: string, @Body() body: unknown, @Req() req: Request) {
    const id = parseIdParam(idParam);
    const parsed = rejectSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(zodErrorMessage(parsed.error));
    }
    if (!req.user) {
      throw new BadRequestException('contracts.errors.sessionUserNotFound');
    }

    const record = await this.prisma.paymentImportRecord.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException('paymentImports.errors.notFound');
    }
    if (record.status === 'MATCHED' || record.status === 'REJECTED') {
      throw new BadRequestException('paymentImports.errors.alreadyReviewed');
    }

    return this.prisma.$transaction(async (tx) => {
      const userId = await ensureUserRecord(tx, req.user!);
      const updated = await tx.paymentImportRecord.update({
        where: { id },
        data: { status: 'REJECTED', reviewedByUserId: userId, reviewedAt: new Date() },
      });

      // Причина отклонения — в историю изменений, отдельного поля под неё в
      // PaymentImportRecord нет (не захотели раздувать схему ради свободного текста).
      await this.auditLog.log(tx, {
        userId,
        action: 'UPDATE',
        entityType: 'PaymentImportRecord',
        entityId: record.id,
        entityLabel: `Платёж из 1С №${record.externalId} — отклонён`,
        before: record,
        after: { ...updated, reason: parsed.data.reason ?? null },
        fields: ['status'],
      });

      return updated;
    });
  }
}
