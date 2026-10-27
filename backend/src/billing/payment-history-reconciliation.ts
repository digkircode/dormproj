import { Prisma } from '../../generated/prisma/client.js';
import { PENALTY_DAILY_RATE } from './accrual-generation';
import { buildAccrualPenaltyCalcs, earliestPenaltyStartsAt, overdueSumOnDay } from './penalty-calc';
import { addDays, daysBetweenInclusive, moscowDateOnly } from './period-utils';

const { Decimal } = Prisma;

type AccrualRow = {
  id: number;
  periodStart: Date;
  periodEnd: Date;
  rentAmount: Prisma.Decimal;
  utilitiesAmount: Prisma.Decimal;
  adjustmentAmount: Prisma.Decimal;
};

type PaymentRow = {
  id: number;
  amount: Prisma.Decimal;
  paidAt: Date;
  penaltyAmount: Prisma.Decimal;
  allocations: { accrualId: number; amount: Prisma.Decimal; isPartial: boolean }[];
};

type RefundRow = { amount: Prisma.Decimal; refundedAt: Date };

type AllocationPlan = { paymentId: number; accrualId: number; amount: Prisma.Decimal; isPartial: boolean };

export async function reconcilePaymentHistoryInTransaction(
  tx: Prisma.TransactionClient,
  contractId: number,
  today = moscowDateOnly(new Date()),
): Promise<boolean> {
  const contract = await tx.contract.findUniqueOrThrow({
    where: { id: contractId },
    include: { accruals: { where: { voidedAt: null }, orderBy: [{ periodStart: 'asc' }, { id: 'asc' }] } },
  });
  const [payments, refunds] = await Promise.all([
    tx.payment.findMany({
      where: { contractId, reversedAt: null },
      orderBy: [{ paidAt: 'asc' }, { id: 'asc' }],
      include: { allocations: { select: { accrualId: true, amount: true, isPartial: true } } },
    }),
    tx.contractRefund.findMany({ where: { contractId }, orderBy: [{ refundedAt: 'asc' }, { id: 'asc' }], select: { amount: true, refundedAt: true } }),
  ]);
  const accruals: AccrualRow[] = contract.accruals;
  const calcs = await buildAccrualPenaltyCalcs(tx, contract, accruals.map((accrual) => ({ ...accrual, allocations: [] })));
  const start = earliestPenaltyStartsAt(calcs);
  const end = contract.status === 'TERMINATED'
    ? (contract.actualEndDate ? (contract.actualEndDate < today ? contract.actualEndDate : today) : addDays(contract.startDate, -1))
    : today;
  const outstanding = accruals.map((accrual) => Prisma.Decimal.max(
    accrual.rentAmount.plus(accrual.utilitiesAmount).plus(accrual.adjustmentAmount), new Decimal(0),
  ));
  const allocations: AllocationPlan[] = [];
  const penaltyByPayment = new Map<number, Prisma.Decimal>();
  let credit = new Decimal(0);
  let penaltyAccrued = new Decimal(0);
  let penaltyPaid = new Decimal(0);
  let lastPenaltyDay = start ? addDays(start, -1) : today;

  function accrueUntil(day: Date): void {
    if (!start || day < start || lastPenaltyDay >= end) return;
    const last = day < end ? day : end;
    if (last <= lastPenaltyDay) return;
    for (let i = 1, count = daysBetweenInclusive(addDays(lastPenaltyDay, 1), last); i <= count; i++) {
      const current = addDays(lastPenaltyDay, i);
      penaltyAccrued = penaltyAccrued.plus(
        overdueSumOnDay(calcs, current, contract.matCapitalDeferredUntil).times(PENALTY_DAILY_RATE).toDecimalPlaces(2),
      );
    }
    lastPenaltyDay = last;
  }

  const events = [
    ...payments.map((payment) => ({ kind: 'payment' as const, date: moscowDateOnly(payment.paidAt), payment })),
    ...refunds.map((refund) => ({ kind: 'refund' as const, date: moscowDateOnly(refund.refundedAt), refund })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime() || (a.kind === 'payment' ? -1 : 1));

  for (const event of events) {
    if (event.kind === 'refund') {
      credit = credit.minus(event.refund.amount);
      if (credit.lessThan(0)) throw new Error(`Возврат по договору №${contract.number} превышает доступную переплату при хронологическом пересчёте`);
      continue;
    }
    const payment: PaymentRow = event.payment;
    const paidAt = event.date;
    accrueUntil(addDays(paidAt, -1));
    let remaining = payment.amount.plus(credit);
    credit = new Decimal(0);

    function allocate(future: boolean): void {
      for (let i = 0; i < accruals.length && remaining.greaterThan(0); i++) {
        if ((accruals[i].periodStart > paidAt) !== future || outstanding[i].lessThanOrEqualTo(0)) continue;
        const amount = Prisma.Decimal.min(remaining, outstanding[i]);
        const total = accruals[i].rentAmount.plus(accruals[i].utilitiesAmount).plus(accruals[i].adjustmentAmount);
        allocations.push({ paymentId: payment.id, accrualId: accruals[i].id, amount, isPartial: amount.lessThan(total) });
        calcs[i].payments.push({ amount, paidAt });
        outstanding[i] = outstanding[i].minus(amount);
        remaining = remaining.minus(amount);
      }
    }

    allocate(false);
    let paidPenalty = new Decimal(0);
    if (paidAt <= today && remaining.greaterThan(0)) {
      paidPenalty = Prisma.Decimal.min(remaining, Prisma.Decimal.max(penaltyAccrued.minus(penaltyPaid), new Decimal(0)));
      remaining = remaining.minus(paidPenalty);
      penaltyPaid = penaltyPaid.plus(paidPenalty);
    }
    penaltyByPayment.set(payment.id, paidPenalty);
    allocate(true);
    credit = remaining;
  }
  accrueUntil(today);

  const plannedByPayment = new Map<number, AllocationPlan[]>();
  for (const allocation of allocations) {
    const list = plannedByPayment.get(allocation.paymentId) ?? [];
    list.push(allocation);
    plannedByPayment.set(allocation.paymentId, list);
  }
  const paymentChanges = payments.filter((payment) => {
    const previous = [...payment.allocations].sort((a, b) => a.accrualId - b.accrualId);
    const planned = [...(plannedByPayment.get(payment.id) ?? [])].sort((a, b) => a.accrualId - b.accrualId);
    return !payment.penaltyAmount.equals(penaltyByPayment.get(payment.id) ?? new Decimal(0))
      || previous.length !== planned.length
      || previous.some((row, index) => row.accrualId !== planned[index].accrualId || !row.amount.equals(planned[index].amount) || row.isPartial !== planned[index].isPartial);
  });
  const creditChanged = !contract.creditBalance.equals(credit);
  if (paymentChanges.length === 0 && !creditChanged) return false;
  if (paymentChanges.some((payment) => payment.source === 'WEBSITE' && payment.accounting1cSyncStatus === 'SYNCED')) {
    throw new Error(`По договору №${contract.number} изменилось разнесение платежа, уже отправленного в 1С; требуется сверка с бухгалтерией`);
  }

  if (payments.length > 0) {
    await tx.paymentAllocation.deleteMany({ where: { paymentId: { in: payments.map((payment) => payment.id) } } });
  }
  if (allocations.length > 0) await tx.paymentAllocation.createMany({ data: allocations });
  for (const payment of paymentChanges) {
    const plannedPenalty = penaltyByPayment.get(payment.id) ?? new Decimal(0);
    if (!payment.penaltyAmount.equals(plannedPenalty)) {
      await tx.payment.update({ where: { id: payment.id }, data: { penaltyAmount: plannedPenalty } });
    }
    await tx.auditLog.create({ data: {
      userId: null, action: 'UPDATE', entityType: 'Payment', entityId: String(payment.id),
      entityLabel: `Хронологическое разнесение оплаты по договору №${contract.number}`,
      changes: {
        penaltyAmount: { before: Number(payment.penaltyAmount), after: Number(plannedPenalty) },
        allocations: {
          before: payment.allocations.map((row) => ({ accrualId: row.accrualId, amount: Number(row.amount) })),
          after: (plannedByPayment.get(payment.id) ?? []).map((row) => ({ accrualId: row.accrualId, amount: Number(row.amount) })),
        },
      },
    } });
  }
  if (creditChanged) await tx.contract.update({ where: { id: contractId }, data: { creditBalance: credit } });
  return true;
}
