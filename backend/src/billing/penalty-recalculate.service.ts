import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { PENALTY_DAILY_RATE } from './accrual-generation';
import { addDays, daysBetweenInclusive, moscowDateOnly } from './period-utils';
import { buildAccrualPenaltyCalcs, earliestPenaltyStartsAt, overdueSumOnDay } from './penalty-calc';
import { reconcilePaymentHistoryInTransaction } from './payment-history-reconciliation';

const { Decimal } = Prisma;

export async function recalculatePenaltyInTransaction(
  tx: Prisma.TransactionClient,
  contractId: number,
  today = moscowDateOnly(new Date()),
): Promise<{ rowsCreated: number; totalAdded: Prisma.Decimal; changed: boolean }> {
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
          const amount = overdueSum.times(PENALTY_DAILY_RATE).toDecimalPlaces(2);
          rows.push({ contractId, date: day, amount, overdueBase: overdueSum });
          totalAdded = totalAdded.plus(amount);
        }
      }
    }

    const previousRows = await tx.penaltyAccrualLog.findMany({
      where: { contractId },
      orderBy: { date: 'asc' },
      select: { date: true, amount: true, overdueBase: true },
    });
    const journalChanged = previousRows.length !== rows.length || previousRows.some((previous, index) =>
      previous.date.getTime() !== rows[index].date.getTime()
      || !previous.amount.equals(rows[index].amount)
      || !previous.overdueBase.equals(rows[index].overdueBase),
    );

    await tx.penaltyAccrualLog.deleteMany({ where: { contractId } });
    if (rows.length > 0) await tx.penaltyAccrualLog.createMany({ data: rows });

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
    return { rowsCreated: rows.length, totalAdded, changed: journalChanged || released.greaterThan(0) };
}

export async function reconcileChronologicalPenaltyInTransaction(
  tx: Prisma.TransactionClient,
  contractId: number,
): Promise<{ rowsCreated: number; totalAdded: Prisma.Decimal; changed: boolean }> {
  const today = moscowDateOnly(new Date());
  const revision = await tx.contract.findUniqueOrThrow({
    where: { id: contractId },
    select: { penaltyRecalcRevision: true, penaltyRecalcPending: true },
  });
  const allocationsChanged = await reconcilePaymentHistoryInTransaction(tx, contractId, today);
  const result = await recalculatePenaltyInTransaction(tx, contractId, today);
  if (revision.penaltyRecalcPending) {
    await tx.contract.updateMany({
      where: { id: contractId, penaltyRecalcRevision: revision.penaltyRecalcRevision },
      data: { penaltyRecalcPending: false },
    });
  }
  return { ...result, changed: result.changed || allocationsChanged };
}

@Injectable()
export class PenaltyRecalculateService {
  constructor(private readonly prisma: PrismaService) {}

  async recalculate(contractId: number): Promise<{ rowsCreated: number; totalAdded: Prisma.Decimal; changed: boolean }> {
    return this.reconcileChronological(contractId);
  }

  async reconcileChronological(contractId: number): Promise<{ rowsCreated: number; totalAdded: Prisma.Decimal; changed: boolean }> {
    return this.prisma.$transaction((tx) => reconcileChronologicalPenaltyInTransaction(tx, contractId),
      { timeout: 120_000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
