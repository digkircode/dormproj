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
  accruals: {
    rentAmount: DecimalLike;
    utilitiesAmount: DecimalLike;
    adjustmentAmount: DecimalLike;
    allocations: { amount: DecimalLike; payment: { paidAt: Date; reversedAt: Date | null } }[];
  }[];
  payments: { amount: DecimalLike; paidAt: Date; reversedAt: Date | null }[];
}

// Пеня — единая сумма на договор, а PaymentAllocation закрывает только тело долга по
// начислениям (см. allocatePaymentFifo) — явного разнесения платежа на пеню в БД нет.
// Сколько из внесённых ДО asOf денег фактически ушло на пеню, выводим тем же приёмом,
// что раньше применялся к одному начислению: всё сверх покрытого ДО asOf тела долга по
// договору целиком считается направленным на пеню (пока не покроет её полностью), остаток
// сверх — переплата/аванс. Платежи/разнесения ПОСЛЕ asOf в расчёт не входят — иначе отчёт
// "на дату X" показывал бы баланс, погашенный уже задним числом.
export function computePenaltyBalance(input: PenaltyBalanceInput): { penaltyAmount: DecimalLike; penaltyPaid: DecimalLike; penaltyBalance: DecimalLike } {
  const penaltyAmount = sumPenaltyLog(input.penaltyLogs, input.asOf);

  const totalPaymentsAsOf = input.payments
    .filter((p) => !p.reversedAt && p.paidAt <= input.asOf)
    .reduce((sum, p) => sum.plus(p.amount), new Decimal(0));
  const totalPrincipalPaidAsOf = input.accruals.reduce(
    (sum, a) =>
      sum.plus(
        a.allocations
          .filter((al) => !al.payment.reversedAt && al.payment.paidAt <= input.asOf)
          .reduce((s, al) => s.plus(al.amount), new Decimal(0)),
      ),
    new Decimal(0),
  );

  const leftover = totalPaymentsAsOf.minus(totalPrincipalPaidAsOf);
  const penaltyPaid = leftover.lessThan(0) ? new Decimal(0) : leftover.greaterThan(penaltyAmount) ? penaltyAmount : leftover;
  return { penaltyAmount, penaltyPaid, penaltyBalance: penaltyAmount.minus(penaltyPaid) };
}
