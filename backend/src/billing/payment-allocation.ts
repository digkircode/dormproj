import { Prisma } from '../../generated/prisma/client.js';
import { computePenaltyBalance } from './penalty-balance';
import { dateOnly } from './period-utils';

const { Decimal } = Prisma;

export async function allocatePaymentFifo(
  tx: Prisma.TransactionClient,
  contractId: number,
  paymentId: number,
  amount: Prisma.Decimal,
  paidAt: Date,
): Promise<Prisma.Decimal> {
  const asOf = dateOnly(paidAt);

  const [contract, accruals] = await Promise.all([
    tx.contract.findUniqueOrThrow({ where: { id: contractId }, select: { creditBalance: true } }),
    tx.accrual.findMany({
      where: { contractId, voidedAt: null },
      orderBy: { periodStart: 'asc' },
      include: { allocations: true },
    }),
  ]);

  let remaining = amount.plus(contract.creditBalance);
  const toCreate: { paymentId: number; accrualId: number; amount: Prisma.Decimal; isPartial: boolean }[] = [];

  function allocateToAccruals(list: typeof accruals): void {
    for (const accrual of list) {
      if (remaining.lessThanOrEqualTo(0)) break;
      const total = accrual.rentAmount.plus(accrual.utilitiesAmount).plus(accrual.adjustmentAmount);
      const alreadyAllocated = accrual.allocations.reduce((sum, a) => sum.plus(a.amount), new Decimal(0));
      const outstanding = total.minus(alreadyAllocated);
      if (outstanding.lessThanOrEqualTo(0)) continue;

      const toAllocate = remaining.lessThan(outstanding) ? remaining : outstanding;
      toCreate.push({ paymentId, accrualId: accrual.id, amount: toAllocate, isPartial: toAllocate.lessThan(total) });
      remaining = remaining.minus(toAllocate);
    }
  }

  const dueAccruals = accruals.filter((a) => a.periodStart <= asOf);
  const futureAccruals = accruals.filter((a) => a.periodStart > asOf);

  allocateToAccruals(dueAccruals);

  let penaltyAllocated = new Decimal(0);
  if (remaining.greaterThan(0)) {
    const [penaltyLogs, priorPayments] = await Promise.all([
      tx.penaltyAccrualLog.findMany({ where: { contractId }, select: { amount: true, date: true } }),
      tx.payment.findMany({ where: { contractId, reversedAt: null }, select: { penaltyAmount: true, paidAt: true, reversedAt: true } }),
    ]);
    const { penaltyBalance } = computePenaltyBalance({ asOf, penaltyLogs, payments: priorPayments });
    if (penaltyBalance.greaterThan(0)) {
      penaltyAllocated = remaining.lessThan(penaltyBalance) ? remaining : penaltyBalance;
      remaining = remaining.minus(penaltyAllocated);
    }
  }

  allocateToAccruals(futureAccruals);

  if (toCreate.length > 0) {
    await tx.paymentAllocation.createMany({ data: toCreate });
  }
  if (penaltyAllocated.greaterThan(0)) {
    await tx.payment.update({ where: { id: paymentId }, data: { penaltyAmount: penaltyAllocated } });
  }
  if (!remaining.equals(contract.creditBalance)) {
    await tx.contract.update({ where: { id: contractId }, data: { creditBalance: remaining } });
  }
  return remaining;
}
