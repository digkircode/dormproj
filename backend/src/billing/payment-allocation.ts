import { Prisma } from '../../generated/prisma/client.js';
import { computePenaltyBalance } from './penalty-balance';
import { dateOnly } from './period-utils';

const { Decimal } = Prisma;

// Порядок распределения (по прямой просьбе 2026-08-31): сначала уже НАСТУПИВШИЕ
// (periodStart <= дата платежа) неоплаченные начисления по FIFO — самое старое первым,
// платёж может закрыть несколько месяцев разом (квартальная/годовая оплата) или быть
// частичным; затем остаток — на пеню (Payment.penaltyAmount, реальное разнесение, не
// эвристика на чтении, см. billing/penalty-balance.ts); и только если ПОСЛЕ пени ещё
// что-то осталось — в БУДУЩИЕ (periodStart > дата платежа) начисления, тоже FIFO, как
// аванс. Раньше пеня вообще не участвовала в этой функции (отдельный penaltyOnly-режим
// в my-payments.controller.ts, обходивший её целиком) — с уборкой "своей суммы"/отдельного
// режима пени в модалке оплаты пеня теперь всегда часть одного и того же платежа.
//
// Остаток, который не влез никуда (все начисления по договору — включая будущие —
// уже закрыты, пени нет/погашена) — не теряется, а копится в Contract.creditBalance
// (см. промпт проекта, код-ревью 2026-09-04). Уже накопленный остаток с ПРОШЛЫХ платежей
// подмешивается сюда же в начале — если на договоре с прошлого раза появился новый долг
// (наступил срок будущего начисления, снова начислена пеня после полного погашения — см.
// penalty.scheduler.ts), эти деньги в первую очередь гасят именно его, ещё до денег самого
// нового платежа. Раз это может закрыть больше, чем сумма конкретного payment.amount —
// сумма созданных PaymentAllocation на этот paymentId может превысить payment.amount,
// это ожидаемо (см. фикс DocumentSumm в build-accounting-payment-payload.ts — там сумма
// документа для 1С считается по факту разнесённого, не по сырому payment.amount).
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
      // isPartial — эта КОНКРЕТНАЯ разноска меньше полной исходной суммы начисления, не
      // важно, из-за собственной неполноты платежа или из-за уже существовавшей раньше
      // частичной оплаты (см. комментарий на PaymentAllocation.isPartial в schema.prisma).
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
