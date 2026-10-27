import { Prisma } from '../../generated/prisma/client.js';
import { isFullMonthAccrualPeriod, penaltyStartsAt } from './accrual-generation';
import { moscowDateOnly } from './period-utils';

const { Decimal } = Prisma;


export interface AccrualPenaltyCalc {
  startsAt: Date;
  principal: Prisma.Decimal;
  isDailyRateAccrual: boolean;
  matCapitalExempt: boolean;
  payments: { amount: Prisma.Decimal; paidAt: Date }[];
}

type AccrualForPenalty = {
  periodStart: Date;
  periodEnd: Date;
  rentAmount: Prisma.Decimal;
  utilitiesAmount: Prisma.Decimal;
  adjustmentAmount: Prisma.Decimal;
  allocations: { amount: Prisma.Decimal; payment: { paidAt: Date; reversedAt: Date | null } }[];
};

type ContractForPenalty = {
  id: number;
  matCapitalCoveredFrom: Date | null;
  matCapitalCoveredTo: Date | null;
};

export async function buildAccrualPenaltyCalcs(
  prisma: Pick<Prisma.TransactionClient, 'contractTerms'>,
  contract: ContractForPenalty,
  accruals: AccrualForPenalty[],
): Promise<AccrualPenaltyCalc[]> {
  const calcs: AccrualPenaltyCalc[] = [];

  for (const accrual of accruals) {
    const principal = accrual.rentAmount.plus(accrual.utilitiesAmount).plus(accrual.adjustmentAmount);

    const terms = await prisma.contractTerms.findFirst({
      where: {
        contractId: contract.id,
        validFrom: { lte: accrual.periodStart },
        OR: [{ validTo: null }, { validTo: { gt: accrual.periodStart } }],
      },
      orderBy: { validFrom: 'desc' },
    });
    const isDailyOnlyRoom = !!terms && terms.rentAmount.isZero() && terms.utilitiesAmount.isZero();
    const isDailyRateAccrual = isDailyOnlyRoom || !isFullMonthAccrualPeriod(accrual.periodStart, accrual.periodEnd);

    const matCapitalExempt = Boolean(
      contract.matCapitalCoveredFrom &&
        contract.matCapitalCoveredTo &&
        accrual.periodStart >= contract.matCapitalCoveredFrom &&
        accrual.periodStart <= contract.matCapitalCoveredTo,
    );

    const payments = accrual.allocations
      .filter((a) => a.payment.reversedAt === null)
      .map((a) => ({ amount: a.amount, paidAt: moscowDateOnly(a.payment.paidAt) }));

    calcs.push({ startsAt: penaltyStartsAt(accrual.periodStart), principal, isDailyRateAccrual, matCapitalExempt, payments });
  }

  return calcs;
}

export function overdueSumOnDay(calcs: AccrualPenaltyCalc[], day: Date, matCapitalDeferredUntil: Date | null): Prisma.Decimal {
  let overdueSum = new Decimal(0);

  for (const calc of calcs) {
    if (day < calc.startsAt) continue;
    if (calc.matCapitalExempt && matCapitalDeferredUntil && day <= matCapitalDeferredUntil) continue;

    const paidAsOfDay = calc.payments.filter((p) => p.paidAt <= day).reduce((sum, p) => sum.plus(p.amount), new Decimal(0));
    const outstanding = calc.principal.minus(paidAsOfDay);
    if (outstanding.lessThanOrEqualTo(0)) continue;

    overdueSum = overdueSum.plus(calc.isDailyRateAccrual ? outstanding : calc.principal);
  }

  return overdueSum;
}

export function earliestPenaltyStartsAt(calcs: AccrualPenaltyCalc[]): Date | null {
  return calcs.reduce((min, c) => (!min || c.startsAt < min ? c.startsAt : min), null as Date | null);
}
