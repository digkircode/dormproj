import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { PENALTY_DAILY_RATE } from './accrual-generation';
import { addDays, daysBetweenInclusive, moscowDateOnly } from './period-utils';
import { buildAccrualPenaltyCalcs, earliestPenaltyStartsAt, overdueSumOnDay } from './penalty-calc';

const { Decimal } = Prisma;

// Ручной пересчёт пени по кнопке сотрудника (billing.controller.ts) — в отличие от ночного
// крона (penalty.scheduler.ts, только инкрементальный катч-ап с последнего запуска),
// перестраивает ВЕСЬ журнал пени договора с нуля тем же дневным расчётом (penalty-calc.ts).
// Нужен для договоров, у которых история пени могла оказаться неверной ещё ДО фикса
// 2026-09-05 (задним числом занесённый договор получал пеню от максимального долга сразу
// за весь пропущенный период вместо нарастания по дням) — обычный крон такую уже
// существующую в БД историю сам не поправит, он только идёт вперёд от penaltyAccruedThrough.
// Вызывается и вручную, и внутри транзакции расторжения: новый журнал и корректировка
// ранее оплаченной пени должны сохраниться вместе с изменением договора.
export async function recalculatePenaltyInTransaction(
  tx: Prisma.TransactionClient,
  contractId: number,
  today = moscowDateOnly(new Date()),
): Promise<{ rowsCreated: number; totalAdded: Prisma.Decimal }> {
    const contract = await tx.contract.findUnique({
      where: { id: contractId },
      include: {
        accruals: {
          where: { voidedAt: null },
          include: {
            allocations: { include: { payment: { select: { paidAt: true, reversedAt: true } } } },
          },
        },
      },
    });
    if (!contract) {
      throw new NotFoundException('contracts.errors.contractNotFound');
    }

    const endDate = contract.status === 'TERMINATED'
      ? (contract.actualEndDate ? (contract.actualEndDate < today ? contract.actualEndDate : today) : addDays(contract.startDate, -1))
      : today;
    const calcs = await buildAccrualPenaltyCalcs(tx, contract, contract.accruals);
    const startsAt = earliestPenaltyStartsAt(calcs);

    const rows: { contractId: number; date: Date; amount: Prisma.Decimal; overdueBase: Prisma.Decimal }[] = [];
    let totalAdded = new Decimal(0);

    if (startsAt && startsAt <= endDate) {
      const days = daysBetweenInclusive(startsAt, endDate);
      for (let i = 0; i < days; i++) {
        const day = addDays(startsAt, i);
        const overdueSum = overdueSumOnDay(calcs, day, contract.matCapitalDeferredUntil);
        if (overdueSum.greaterThan(0)) {
          const amount = overdueSum.times(PENALTY_DAILY_RATE);
          rows.push({ contractId, date: day, amount, overdueBase: overdueSum });
          totalAdded = totalAdded.plus(amount);
        }
      }
    }

    // Полная пересборка — старый журнал договора удаляется целиком и заменяется заново
    // посчитанным, а не дополняется: старые строки могли быть посчитаны неверно (см.
    // комментарий выше), оставлять их рядом с новыми означало бы задвоить пеню за одни и
    // те же дни.
    await tx.penaltyAccrualLog.deleteMany({ where: { contractId } });
    if (rows.length > 0) await tx.penaltyAccrualLog.createMany({ data: rows });

    // Если пеня уменьшилась после перерасчёта, ранее зачтённая в неё часть платежей
    // снова становится переплатой. Иначе карточка покажет отрицательный остаток пени,
    // а возврат окажется меньше действительной переплаты.
    const penaltyPayments = await tx.payment.findMany({
      where: { contractId, reversedAt: null, paidAt: { lte: new Date() }, penaltyAmount: { gt: 0 } },
      orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
      select: { id: true, penaltyAmount: true },
    });
    const penaltyPaid = penaltyPayments.reduce((sum, payment) => sum.plus(payment.penaltyAmount), new Decimal(0));
    const released = Prisma.Decimal.max(penaltyPaid.minus(totalAdded), new Decimal(0));
    let remaining = released;
    for (const payment of penaltyPayments) {
      if (remaining.lessThanOrEqualTo(0)) break;
      const fromPayment = Prisma.Decimal.min(remaining, payment.penaltyAmount);
      const newAmount = payment.penaltyAmount.minus(fromPayment);
      await tx.payment.update({ where: { id: payment.id }, data: { penaltyAmount: newAmount } });
      await tx.auditLog.create({ data: {
        userId: null, action: 'UPDATE', entityType: 'Payment', entityId: String(payment.id),
        entityLabel: `Перераспределение пени по договору №${contract.number}`,
        changes: { penaltyAmount: { before: Number(payment.penaltyAmount), after: Number(newAmount) } },
      } });
      remaining = remaining.minus(fromPayment);
    }
    await tx.contract.update({
      where: { id: contractId },
      data: { penaltyAccruedThrough: today, ...(released.greaterThan(0) ? { creditBalance: { increment: released } } : {}) },
    });

    return { rowsCreated: rows.length, totalAdded };
}

@Injectable()
export class PenaltyRecalculateService {
  constructor(private readonly prisma: PrismaService) {}

  async recalculate(contractId: number): Promise<{ rowsCreated: number; totalAdded: Prisma.Decimal }> {
    return this.prisma.$transaction((tx) => recalculatePenaltyInTransaction(tx, contractId), { timeout: 120_000 });
  }
}
