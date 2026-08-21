import { Prisma } from '../../generated/prisma/client.js';

const { Decimal } = Prisma;
type DecimalLike = Prisma.Decimal;

export interface PenaltyBalanceInput {
  penaltyAmount: DecimalLike;
  accruals: { rentAmount: DecimalLike; utilitiesAmount: DecimalLike; adjustmentAmount: DecimalLike; allocations: { amount: DecimalLike }[] }[];
  payments: { amount: DecimalLike; reversedAt: Date | null }[];
}

// Пеня — единая сумма на договор (Contract.penaltyAmount), а PaymentAllocation закрывает
// только тело долга по начислениям (см. allocatePaymentFifo) — явного разнесения платежа
// на пеню в БД нет. Сколько из внесённых денег фактически ушло на пеню, выводим тем же
// приёмом, что раньше применялся к одному начислению: всё сверх покрытого тела долга по
// договору целиком считается направленным на пеню (пока не покроет её полностью), остаток
// сверх — переплата/аванс. reversedAt-платежи исключены (их разнесения уже удалены).
export function computePenaltyBalance(input: PenaltyBalanceInput): { penaltyPaid: DecimalLike; penaltyBalance: DecimalLike } {
  const totalPayments = input.payments.filter((p) => !p.reversedAt).reduce((sum, p) => sum.plus(p.amount), new Decimal(0));
  const totalPrincipalPaid = input.accruals.reduce(
    (sum, a) => sum.plus(a.allocations.reduce((s, alloc) => s.plus(alloc.amount), new Decimal(0))),
    new Decimal(0),
  );
  const leftover = totalPayments.minus(totalPrincipalPaid);
  const penaltyPaid = leftover.lessThan(0) ? new Decimal(0) : leftover.greaterThan(input.penaltyAmount) ? input.penaltyAmount : leftover;
  return { penaltyPaid, penaltyBalance: input.penaltyAmount.minus(penaltyPaid) };
}
