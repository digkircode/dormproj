import { Prisma } from '../../generated/prisma/client.js';
import { computeAccrualAmounts } from './accrual-generation';

// При досрочном расторжении: начисления полностью в будущем от даты выезда не нужны —
// помечаем voidedAt (не удаляем физически, чтобы не терять историю того, что вообще
// планировалось). Начисление, на границу которого попадает дата выезда, не отменяется и
// не мутируется напрямую — пересчитывается по сокращённым дням, а разница с исходно
// выставленной суммой оформляется adjustmentAmount, чтобы не переписывать то, что реально
// было выставлено человеку.
export async function recalcAccrualsForTermination(
  tx: Prisma.TransactionClient,
  contractId: number,
  actualEndDate: Date,
): Promise<void> {
  const accruals = await tx.accrual.findMany({
    where: { contractId, voidedAt: null },
    orderBy: { periodStart: 'asc' },
  });

  for (const accrual of accruals) {
    if (accrual.periodStart > actualEndDate) {
      await tx.accrual.update({ where: { id: accrual.id }, data: { voidedAt: new Date() } });
      continue;
    }
    if (accrual.periodEnd <= actualEndDate) {
      // Полностью в прошлом от даты выезда — уже наступивший период, трогать не нужно.
      continue;
    }

    const terms = await tx.contractTerms.findFirst({
      where: { contractId, validFrom: { lte: accrual.periodStart }, OR: [{ validTo: null }, { validTo: { gt: accrual.periodStart } }] },
      orderBy: { validFrom: 'desc' },
    });
    if (!terms) continue;

    const shortened = { periodStart: accrual.periodStart, periodEnd: actualEndDate, isFullMonth: false };
    const { rentAmount, utilitiesAmount } = computeAccrualAmounts(shortened, terms);
    const originalTotal = accrual.rentAmount.plus(accrual.utilitiesAmount);
    const newTotal = rentAmount.plus(utilitiesAmount);

    await tx.accrual.update({
      where: { id: accrual.id },
      data: {
        adjustmentAmount: newTotal.minus(originalTotal),
        adjustmentReason: `Пересчёт при досрочном выезде ${actualEndDate.toISOString().slice(0, 10)}`,
      },
    });
  }
}
