import { Prisma } from '../../generated/prisma/client.js';

const { Decimal } = Prisma;

// Сумма к оплате по начислению целиком (найм+коммуналка+пеня+корректировка) — то, что
// в итоге закрывают PaymentAllocation. Не различаем "тело долга" и "пеню" на уровне
// отдельных строк разнесения — платёж просто закрывает начисление целиком по порядку.
export function accrualTotal(accrual: {
  rentAmount: Prisma.Decimal;
  utilitiesAmount: Prisma.Decimal;
  penaltyAmount: Prisma.Decimal;
  adjustmentAmount: Prisma.Decimal;
}): Prisma.Decimal {
  return accrual.rentAmount.plus(accrual.utilitiesAmount).plus(accrual.penaltyAmount).plus(accrual.adjustmentAmount);
}

// FIFO — сначала самое старое неоплаченное начисление (см. дизайн-документ: платёж может
// закрыть несколько месяцев разом — квартальная/годовая оплата, а может быть частичным).
// Остаток сверх всех неоплаченных начислений просто не разносится (переплата/аванс —
// видна как payment.amount минус сумма фактически созданных allocations, отдельной
// сущности "кредит" не заводим, пока не появится реальная потребность).
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
    const total = accrual.rentAmount.plus(accrual.utilitiesAmount).plus(accrual.penaltyAmount).plus(accrual.adjustmentAmount);
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
