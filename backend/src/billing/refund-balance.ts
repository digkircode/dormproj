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
  refunds: { amount: Prisma.Decimal; creditAmount: Prisma.Decimal; adjustmentAmount: Prisma.Decimal; refundedAt: Date }[];
}

export function refundTotal(refunds: { amount: Prisma.Decimal; refundedAt: Date }[], asOf?: Date): Prisma.Decimal {
  return refunds
    .filter((refund) => !asOf || refund.refundedAt <= asOf)
    .reduce((sum, refund) => sum.plus(refund.amount), new Decimal(0));
}

export function allocatedRefundTotal(refunds: { amount: Prisma.Decimal; creditAmount: Prisma.Decimal; refundedAt: Date }[], asOf?: Date): Prisma.Decimal {
  return refunds
    .filter((refund) => !asOf || refund.refundedAt <= asOf)
    .reduce((sum, refund) => sum.plus(refund.amount.minus(refund.creditAmount)), new Decimal(0));
}

export function accrualPaidNetOfRefunds(accrual: RefundAccrual, asOf?: Date): Prisma.Decimal {
  const allocated = accrual.allocations
    .filter((allocation) => !allocation.payment.reversedAt && (!asOf || allocation.payment.paidAt <= asOf))
    .reduce((sum, allocation) => sum.plus(allocation.amount), new Decimal(0));
  return allocated.minus(allocatedRefundTotal(accrual.refunds, asOf));
}

type ContractRefundInput = {
  accruals: RefundAccrual[];
  penaltyLogs: { amount: Prisma.Decimal; date: Date }[];
  payments: { amount: Prisma.Decimal; penaltyAmount: Prisma.Decimal; paidAt: Date; reversedAt: Date | null }[];
  refunds: { amount: Prisma.Decimal; refundedAt: Date }[];
  asOf: Date;
};

// Переплата считается по всему договору: будущие начисления и неоплаченная пеня
// сначала покрываются входящими платежами, уже зафиксированные возвраты вычитаются.
export function contractOverpayment(input: ContractRefundInput): Prisma.Decimal {
  const active = input.accruals.filter((accrual) => !accrual.voidedAt);
  const penalty = computePenaltyBalance({ asOf: input.asOf, penaltyLogs: input.penaltyLogs, payments: input.payments });
  const charged = active.reduce((sum, accrual) =>
    sum.plus(accrual.rentAmount).plus(accrual.utilitiesAmount).plus(accrual.adjustmentAmount), penalty.penaltyAmount);
  const received = input.payments
    .filter((payment) => payment.paidAt <= input.asOf && !payment.reversedAt)
    .reduce((sum, payment) => sum.plus(payment.amount), new Decimal(0));
  return Prisma.Decimal.max(received.minus(charged).minus(refundTotal(input.refunds, input.asOf)), new Decimal(0));
}

// Один возврат может включать остаток корректировки и свободный кредит договора.
// Если переплата распределена по нескольким корректировкам, за один раз возвращаем
// долю одной из них; после сохранения кнопка останется доступной для остатка.
export function availableContractRefund(input: ContractRefundInput & { creditBalance: Prisma.Decimal }):
  { accrualId: number | null; amount: Prisma.Decimal; remainingCorrection: Prisma.Decimal } | null {
  const overpayment = contractOverpayment(input);
  if (overpayment.lessThanOrEqualTo(0)) return null;

  const candidates = input.accruals
    .filter((accrual) => !accrual.voidedAt)
    .filter((accrual) => accrual.adjustmentAmount.lessThan(0))
    .sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime());
  for (const accrual of candidates) {
    const alreadyRefunded = accrual.refunds
      .filter((refund) => refund.refundedAt <= input.asOf)
      .reduce((sum, refund) => sum.plus(refund.adjustmentAmount), new Decimal(0));
    const remainingCorrection = accrual.adjustmentAmount.negated().minus(alreadyRefunded);
    const overallocated = Prisma.Decimal.max(
      accrualPaidNetOfRefunds(accrual, input.asOf).minus(accrual.rentAmount).minus(accrual.utilitiesAmount).minus(accrual.adjustmentAmount),
      new Decimal(0),
    );
    const amount = Prisma.Decimal.min(overpayment, input.creditBalance.plus(overallocated));
    const refundableCorrection = Prisma.Decimal.min(remainingCorrection, overallocated);
    if (refundableCorrection.greaterThan(0) && amount.greaterThan(0)) {
      return { accrualId: accrual.id, amount, remainingCorrection: refundableCorrection };
    }
  }
  // В обычном потоке свободные деньги лежат в creditBalance. Этот запасной путь
  // покрывает и старые/ручные данные, где платёж остался сверх начисления без корректировки.
  for (const accrual of input.accruals.filter((row) => !row.voidedAt)) {
    const overallocated = Prisma.Decimal.max(
      accrualPaidNetOfRefunds(accrual, input.asOf).minus(accrual.rentAmount).minus(accrual.utilitiesAmount).minus(accrual.adjustmentAmount),
      new Decimal(0),
    );
    if (overallocated.greaterThan(0)) {
      return {
        accrualId: accrual.id,
        amount: Prisma.Decimal.min(overpayment, input.creditBalance.plus(overallocated)),
        remainingCorrection: new Decimal(0),
      };
    }
  }
  const amount = Prisma.Decimal.min(overpayment, input.creditBalance);
  return amount.greaterThan(0) ? { accrualId: null, amount, remainingCorrection: new Decimal(0) } : null;
}

// Доступная сумма возврата делится по причине: оплаченная часть корректировки
// и прочая переплата. Способ хранения денег (creditBalance или разноска по
// начислению) не определяет причину возврата.
export function refundSourceBreakdown(available: ReturnType<typeof availableContractRefund>) {
  const correctionAmount = available
    ? Prisma.Decimal.min(available.amount, available.remainingCorrection)
    : new Decimal(0);
  return {
    correctionAmount,
    overpaymentAmount: available ? available.amount.minus(correctionAmount) : new Decimal(0),
  };
}
