import { Prisma } from '../../generated/prisma/client.js';

const { Decimal } = Prisma;

// FIFO — сначала самое старое неоплаченное начисление (см. дизайн-документ: платёж может
// закрыть несколько месяцев разом — квартальная/годовая оплата, а может быть частичным).
// Разносится только тело долга (найм+коммуналка+корректировка) — пеня с 2026-08-22 единая
// на договор, а не на начисление (см. Contract.penaltyAmount), явного разнесения платежа
// на неё в БД нет, см. billing/penalty-balance.ts. Остаток сверх всех неоплаченных
// начислений просто не разносится (переплата/аванс/покрытие пени — выводится на чтении,
// см. computePenaltyBalance, отдельной сущности "кредит" не заводим, пока не появится
// реальная потребность).
export async function allocatePaymentFifo(
  tx: Prisma.TransactionClient,
  contractId: number,
  paymentId: number,
  amount: Prisma.Decimal,
): Promise<Prisma.Decimal> {
  const accruals = await tx.accrual.findMany({
    where: { contractId, voidedAt: null },
    orderBy: { periodStart: 'asc' },
    include: { allocations: true },
  });

  let remaining = amount;
  const toCreate: { paymentId: number; accrualId: number; amount: Prisma.Decimal }[] = [];

  for (const accrual of accruals) {
    if (remaining.lessThanOrEqualTo(0)) break;
    const total = accrual.rentAmount.plus(accrual.utilitiesAmount).plus(accrual.adjustmentAmount);
    const alreadyAllocated = accrual.allocations.reduce((sum, a) => sum.plus(a.amount), new Decimal(0));
    const outstanding = total.minus(alreadyAllocated);
    if (outstanding.lessThanOrEqualTo(0)) continue;

    const toAllocate = remaining.lessThan(outstanding) ? remaining : outstanding;
    toCreate.push({ paymentId, accrualId: accrual.id, amount: toAllocate });
    remaining = remaining.minus(toAllocate);
  }

  if (toCreate.length > 0) {
    await tx.paymentAllocation.createMany({ data: toCreate });
  }
  return remaining;
}
