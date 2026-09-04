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
import { findCandidateContracts } from './suggest-contract-match';
import { buildPaymentPurpose } from '../billing/payment-purpose';

// Сумма и дата платежа — только из 1С, сотрудник их не правит (по прямой просьбе
// 2026-09-03 — если в 1С заполнено неверно, поправят там, у нас перезапишется при
// следующем импорте). Выбирается только договор (см. findCandidateContracts — у
// контрагента может быть несколько) и способ поступления.
const approveSchema = z.object({
  contractId: z.number().int().positive(),
  method: z.enum(['CASH', 'CARD_ACQUIRING', 'BANK_TRANSFER', 'MAT_CAPITAL', 'WEBSITE']),
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
        contract: { select: { id: true, number: true, residentIndividualUid: true, resident: { select: { fullName: true } } } },
        paymentIntent: { select: { payerFullName: true } },
        allocations: { include: { accrual: { select: { periodStart: true } } } },
      },
    });
    return payments.map((payment) => ({
      id: payment.id,
      paidAt: payment.paidAt,
      amount: Number(payment.amount),
      contractorFio: payment.contract.resident.fullName,
      contract: { id: payment.contract.id, number: payment.contract.number, residentIndividualUid: payment.contract.residentIndividualUid },
      purpose: buildPaymentPurpose({
        source: 'WEBSITE',
        residentFullName: payment.contract.resident.fullName,
        payerFullName: payment.paymentIntent?.payerFullName,
        periodStarts: payment.allocations.map((a) => a.accrual.periodStart),
        includePenalty: payment.penaltyAmount.greaterThan(0),
        fallbackPeriodDate: payment.paidAt,
      }),
      accounting1cSyncStatus: payment.accounting1cSyncStatus,
      accounting1cDocumentUid: payment.accounting1cDocumentUid,
      accounting1cSyncError: payment.accounting1cSyncError,
      accounting1cSyncedAt: payment.accounting1cSyncedAt,
      // Для колонки "Чек" на фронте (тот же принцип, что и в объединённом леджере
      // резидента, MyContract.vue) — сторнированному платежу кнопку чека не показываем.
      reversedAt: payment.reversedAt,
    }));
  }

  @Get(':id')
  async detail(@Param('id') idParam: string) {
    const id = parseIdParam(idParam);
    const record = await this.prisma.paymentImportRecord.findUnique({
      where: { id },
      include: {
        suggestedContract: { select: { id: true, number: true, residentIndividualUid: true, resident: { select: { fullName: true } } } },
        matchedContract: { select: { id: true, number: true, residentIndividualUid: true } },
      },
    });
    if (!record) {
      throw new NotFoundException('paymentImports.errors.notFound');
    }
    const candidate = parsePaymentImportCandidate(record.rawPayload as Record<string, unknown>);
    const candidateContracts = await findCandidateContracts(this.prisma, candidate);
    return {
      id: record.id,
      status: record.status,
      externalId: record.externalId,
      importedAt: record.importedAt,
      rawPayload: record.rawPayload,
      candidate,
      suggestedContract: record.suggestedContract
        ? {
            id: record.suggestedContract.id,
            number: record.suggestedContract.number,
            residentFullName: record.suggestedContract.resident.fullName,
            residentIndividualUid: record.suggestedContract.residentIndividualUid,
          }
        : null,
      matchedContract: record.matchedContract,
      // Все договоры опознанного контрагента — если их больше одного, фронт рисует
      // выпадающий список вместо одной "чипы" (см. suggest-contract-match.ts).
      candidateContracts,
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
    if (record.status === 'MATCHED') {
      throw new BadRequestException('paymentImports.errors.alreadyReviewed');
    }

    const contract = await this.prisma.contract.findUnique({ where: { id: parsed.data.contractId }, select: { id: true, number: true } });
    if (!contract) {
      throw new NotFoundException('contracts.errors.contractNotFound');
    }

    const candidate = parsePaymentImportCandidate(record.rawPayload as Record<string, unknown>);
    const amount = new Prisma.Decimal(candidate.amount ?? 0);
    if (amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('paymentImports.errors.amountRequired');
    }
    const paidAt = candidate.paidAt ?? record.importedAt;

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
}
