import { Prisma } from '../../generated/prisma/client.js';
import { computeAccrualAmounts, computeDailyOnlyAccrualAmount } from './accrual-generation';

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
      continue;
    }

    const terms = await tx.contractTerms.findFirst({
      where: { contractId, validFrom: { lte: accrual.periodStart }, OR: [{ validTo: null }, { validTo: { gt: accrual.periodStart } }] },
      orderBy: { validFrom: 'desc' },
    });
    if (!terms) continue;

    const shortened = { periodStart: accrual.periodStart, periodEnd: actualEndDate, isFullMonth: false };
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
