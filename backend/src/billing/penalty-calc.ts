import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service';
import { isFullMonthAccrualPeriod, penaltyStartsAt } from './accrual-generation';

const { Decimal } = Prisma;

// Общая часть между ночным кроном (penalty.scheduler.ts, инкрементальный катч-ап) и ручным
// пересчётом по кнопке сотрудника (penalty-recalculate.service.ts, полная пересборка с нуля)
// — оба обязаны считать пеню ОДИНАКОВО день за днём, иначе они будут тихо расходиться между
// собой. Не звать напрямую откуда-то ещё — расчёт по одному конкретному дню, без похода в БД
// (все данные уже должны быть на руках, см. buildAccrualPenaltyCalcs ниже).

// Статичная (не зависящая от конкретного дня расчёта) часть по одному начислению.
export interface AccrualPenaltyCalc {
  startsAt: Date; // с какого дня начисление считается просроченным (penaltyStartsAt)
  principal: Prisma.Decimal; // rentAmount+utilitiesAmount+adjustmentAmount
  isDailyRateAccrual: boolean; // база = outstanding(day), а не фиксированный principal (см. ниже)
  matCapitalExempt: boolean; // periodStart попадает в период, закрытый маткапиталом
  // Только неотсторнированные платежи — amount/paidAt каждой разноски на это начисление.
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

// Раз на начисление (не на каждый день катч-апа, см. вызывающий код) — ContractTerms
// запрашивается отдельным findFirst на каждое начисление, тот же N+1, что был и раньше в
// этом кроне, на текущем объёме не критично (см. известные проблемы в промпте проекта).
export async function buildAccrualPenaltyCalcs(
  prisma: PrismaService,
  contract: ContractForPenalty,
  accruals: AccrualForPenalty[],
): Promise<AccrualPenaltyCalc[]> {
  const calcs: AccrualPenaltyCalc[] = [];

  for (const accrual of accruals) {
    const principal = accrual.rentAmount.plus(accrual.utilitiesAmount).plus(accrual.adjustmentAmount);

    // База пени — по прямой просьбе (2026-08-31, найдено пользователем при сверке с
    // реальными данными): для ОБЫЧНОГО (не посуточного) начисления это фиксированная
    // стоимость комнаты за месяц (principal) — частичная оплата НЕ уменьшает базу, пока
    // начисление не закрыто полностью. Уменьшается от факта оплаты база только у
    // посуточных начислений (неполный крайний месяц ИЛИ комната без месячной "Стоимости",
    // 112-2/410-2 — там rentAmount/utilitiesAmount не два раздельных обязательства, а один
    // и тот же посуточный платёж, искусственно разбитый пополам для отчётности, см.
    // accrual-generation.ts#computeAccrualAmounts).
    const terms = await prisma.contractTerms.findFirst({
      where: {
        contractId: contract.id,
        validFrom: { lte: accrual.periodStart },
        OR: [{ validTo: null }, { validTo: { gt: accrual.periodStart } }],
      },
      orderBy: { validFrom: 'desc' },
    });
    // rentAmount=0 и utilitiesAmount=0 одновременно на ContractTerms — признак полностью
    // посуточной комнаты (см. termination.ts#isDailyOnly), обычная комната всегда имеет
    // ненулевую месячную "Стоимость".
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
      .map((a) => ({ amount: a.amount, paidAt: a.payment.paidAt }));

    calcs.push({ startsAt: penaltyStartsAt(accrual.periodStart), principal, isDailyRateAccrual, matCapitalExempt, payments });
  }

  return calcs;
}

// Долг договора ИМЕННО на день `day` — "оплачено ли начисление" смотрит на дату конкретных
// платежей (paidAt <= day), а не на текущий факт оплаты: платёж, поступивший уже ПОСЛЕ
// дня, за который считаем пеню (например, подтянутый вместе с задним числом занесённым
// договором), не должен задним числом занижать пеню за более ранние дни.
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

// Самый ранний день, с которого ХОТЯ БЫ ОДНО начисление в принципе может быть просрочено —
// чисто по датам, без учёта оплаты (та проверяется отдельно на каждый день, см. выше).
// Нижняя граница для катч-апа "с нуля" (когда penaltyAccruedThrough ещё не задан).
export function earliestPenaltyStartsAt(calcs: AccrualPenaltyCalc[]): Date | null {
  return calcs.reduce((min, c) => (!min || c.startsAt < min ? c.startsAt : min), null as Date | null);
}
