import { Prisma } from '../../generated/prisma/client.js';
import { computeAccrualAmounts, computeDailyOnlyAccrualAmount } from './accrual-generation';

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
    // rentAmount=0 и utilitiesAmount=0 одновременно на ContractTerms — только у полностью
    // посуточных комнат (см. contracts.controller.ts#create, isDailyOnlyRoom): обычная комната
    // всегда имеет ненулевую месячную "Стоимость". Пересчёт по той же ветке, что и генерация.
    const isDailyOnly = terms.rentAmount.isZero() && terms.utilitiesAmount.isZero();
    const { rentAmount, utilitiesAmount } = isDailyOnly
      ? { rentAmount: computeDailyOnlyAccrualAmount(shortened, terms.dailyRateAmount), utilitiesAmount: new Prisma.Decimal(0) }
      : computeAccrualAmounts(shortened, terms);
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
