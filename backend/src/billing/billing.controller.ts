import { BadRequestException, Body, Controller, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ensureUserRecord } from '../users/ensure-user';
import { allocatePaymentFifo } from './payment-allocation';
import { serializePayment } from '../contracts/serializers';

const createPaymentSchema = z.object({
  amount: z.number().finite().positive(),
  paidAt: z.coerce.date(),
  method: z.enum(['CASH', 'CARD_ACQUIRING', 'BANK_TRANSFER', 'MAT_CAPITAL', 'WEBSITE']),
  rawComment: z.string().trim().min(1).nullish(),
});

function parseIdParam(idParam: string): number {
  const id = Number.parseInt(idParam, 10);
  if (!Number.isInteger(id)) {
    throw new BadRequestException('Некорректный id');
  }
  return id;
}

@Controller()
@UseGuards(AuthGuard)
export class BillingController {
  constructor(private readonly prisma: PrismaService) {}

  // Ручной платёж (сотрудник вносит) — сразу разносится по неоплаченным начислениям
  // (FIFO, самое старое первым, см. billing/payment-allocation.ts). Источник — всегда
  // MANUAL: импорт из 1С и оплата на сайте — отдельные, ещё не реализованные потоки
  // (см. дизайн-документ), это не тот же эндпоинт.
  @Post('contracts/:contractId/payments')
  async createPayment(@Param('contractId') contractIdParam: string, @Body() body: unknown, @Req() req: Request) {
    const contractId = parseIdParam(contractIdParam);
    const parsed = createPaymentSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    if (!req.user) {
      throw new BadRequestException('Не удалось определить пользователя сессии');
    }

    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) {
      throw new NotFoundException('Договор не найден');
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
      await allocatePaymentFifo(tx, contractId, payment.id, amount);
      return serializePayment(payment);
    });
  }

  // Сторно — платёж внесён ошибочно. Не удаляем сам Payment (остаётся с reversedAt для
  // истории), но снимаем его разнесение — начисления сразу же снова видны как неоплаченные.
  @Post('payments/:paymentId/reverse')
  async reversePayment(@Param('paymentId') paymentIdParam: string) {
    const paymentId = parseIdParam(paymentIdParam);
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      throw new NotFoundException('Платёж не найден');
    }
    if (payment.reversedAt) {
      throw new BadRequestException('Платёж уже сторнирован');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.paymentAllocation.deleteMany({ where: { paymentId } });
      const updated = await tx.payment.update({ where: { id: paymentId }, data: { reversedAt: new Date() } });
      return serializePayment(updated);
    });
  }
}
