import { Prisma } from '../../generated/prisma/client.js';

const { Decimal } = Prisma;
type DecimalLike = Prisma.Decimal;

export function sumPenaltyLog(logs: { amount: DecimalLike; date: Date }[], asOf: Date): DecimalLike {
  return logs.filter((l) => l.date <= asOf).reduce((sum, l) => sum.plus(l.amount), new Decimal(0));
}

export interface PenaltyBalanceInput {
  asOf: Date;
  penaltyLogs: { amount: DecimalLike; date: Date }[];
  payments: { penaltyAmount: DecimalLike; paidAt: Date; reversedAt: Date | null }[];
}

export function computePenaltyBalance(input: PenaltyBalanceInput): { penaltyAmount: DecimalLike; penaltyPaid: DecimalLike; penaltyBalance: DecimalLike } {
  const penaltyAmount = sumPenaltyLog(input.penaltyLogs, input.asOf);
  const penaltyPaid = input.payments
    .filter((p) => !p.reversedAt && p.paidAt <= input.asOf)
    .reduce((sum, p) => sum.plus(p.penaltyAmount), new Decimal(0));
  return { penaltyAmount, penaltyPaid, penaltyBalance: penaltyAmount.minus(penaltyPaid) };
}
