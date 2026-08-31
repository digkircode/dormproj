import { Prisma } from '../../generated/prisma/client.js';

const { Decimal } = Prisma;
type DecimalLike = Prisma.Decimal;

// Пеня договора на дату asOf — сумма строк журнала (PenaltyAccrualLog) ПО ЭТУ дату
// включительно, не текущее "на сейчас" значение (журнал и есть единственный источник
// суммы, см. schema.prisma). Даёт отчёту точную пеню на произвольную прошлую дату.
export function sumPenaltyLog(logs: { amount: DecimalLike; date: Date }[], asOf: Date): DecimalLike {
  return logs.filter((l) => l.date <= asOf).reduce((sum, l) => sum.plus(l.amount), new Decimal(0));
}

export interface PenaltyBalanceInput {
  asOf: Date;
  penaltyLogs: { amount: DecimalLike; date: Date }[];
  payments: { penaltyAmount: DecimalLike; paidAt: Date; reversedAt: Date | null }[];
}

// Сколько из пени реально оплачено — с 2026-08-31 честная сумма Payment.penaltyAmount
// (реальное разнесение, см. billing/payment-allocation.ts#allocatePaymentFifo), а не
// эвристика "всё, что осталось сверх тела долга — значит ушло на пеню". Платежи после
// asOf в расчёт не входят — иначе отчёт "на дату X" показывал бы баланс, погашенный уже
// задним числом.
export function computePenaltyBalance(input: PenaltyBalanceInput): { penaltyAmount: DecimalLike; penaltyPaid: DecimalLike; penaltyBalance: DecimalLike } {
  const penaltyAmount = sumPenaltyLog(input.penaltyLogs, input.asOf);
  const penaltyPaid = input.payments
    .filter((p) => !p.reversedAt && p.paidAt <= input.asOf)
    .reduce((sum, p) => sum.plus(p.penaltyAmount), new Decimal(0));
  return { penaltyAmount, penaltyPaid, penaltyBalance: penaltyAmount.minus(penaltyPaid) };
}
