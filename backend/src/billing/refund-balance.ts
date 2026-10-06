import { Prisma } from '../../generated/prisma/client.js';
import { computePenaltyBalance } from './penalty-balance';

const { Decimal } = Prisma;

export interface RefundAccrual {
  id: number;
  periodStart: Date;
  voidedAt: Date | null;
  rentAmount: Prisma.Decimal;
  utilitiesAmount: Prisma.Decimal;
  adjustmentAmount: Prisma.Decimal;
  allocations: { amount: Prisma.Decimal; payment: { paidAt: Date; reversedAt: Date | null } }[];
  refunds: { amount: Prisma.Decimal; refundedAt: Date }[];
}

export function refundTotal(refunds: { amount: Prisma.Decimal; refundedAt: Date }[], asOf?: Date): Prisma.Decimal {
  return refunds
    .filter((refund) => !asOf || refund.refundedAt <= asOf)
    .reduce((sum, refund) => sum.plus(refund.amount), new Decimal(0));
}

export function accrualPaidNetOfRefunds(accrual: RefundAccrual, asOf?: Date): Prisma.Decimal {
  const allocated = accrual.allocations
    .filter((allocation) => (!allocation.payment.reversedAt || (asOf && allocation.payment.reversedAt > asOf)) && (!asOf || allocation.payment.paidAt <= asOf))
    .reduce((sum, allocation) => sum.plus(allocation.amount), new Decimal(0));
  return allocated.minus(refundTotal(accrual.refunds, asOf));
}

// Возврат разрешён только из доказанной переплаты по скорректированному начислению,
// которая не нужна для покрытия других начислений и пени по этому же договору.
export function availableAdjustmentRefund(input: {
  accruals: RefundAccrual[];
  penaltyLogs: { amount: Prisma.Decimal; date: Date }[];
  payments: { penaltyAmount: Prisma.Decimal; paidAt: Date; reversedAt: Date | null }[];
  asOf: Date;
}): { accrualId: number; amount: Prisma.Decimal } | null {
  const active = input.accruals.filter((accrual) => !accrual.voidedAt);
  const penalty = computePenaltyBalance({ asOf: input.asOf, penaltyLogs: input.penaltyLogs, payments: input.payments });
  const totalBalance = active.reduce((sum, accrual) => {
    const total = accrual.rentAmount.plus(accrual.utilitiesAmount).plus(accrual.adjustmentAmount);
    return sum.plus(total.minus(accrualPaidNetOfRefunds(accrual, input.asOf)));
  }, penalty.penaltyBalance);
  if (totalBalance.greaterThanOrEqualTo(0)) return null;

  const candidates = active
    .filter((accrual) => accrual.adjustmentAmount.lessThan(0))
    .sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime());
  for (const accrual of candidates) {
    const total = accrual.rentAmount.plus(accrual.utilitiesAmount).plus(accrual.adjustmentAmount);
    const alreadyRefunded = refundTotal(accrual.refunds, input.asOf);
    const localOverpayment = accrualPaidNetOfRefunds(accrual, input.asOf).minus(total);
    const remainingCorrection = accrual.adjustmentAmount.negated().minus(alreadyRefunded);
    const amount = Prisma.Decimal.min(totalBalance.negated(), localOverpayment, remainingCorrection);
    if (amount.greaterThan(0)) return { accrualId: accrual.id, amount };
  }
  return null;
}
