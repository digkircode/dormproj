import { BadRequestException, Body, Controller, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
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

const createPaymentSchema = z.object({
  amount: z.number().finite().positive(),
  paidAt: z.coerce.date(),
  method: z.enum(['CASH', 'CARD_ACQUIRING', 'BANK_TRANSFER', 'MAT_CAPITAL', 'WEBSITE']),
  rawComment: z.string().trim().min(1).nullish(),
});

const AUDITED_PAYMENT_FIELDS = ['amount', 'paidAt', 'method', 'source', 'rawComment', 'reversedAt'];

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
}
