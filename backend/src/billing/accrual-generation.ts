import { Prisma } from '../../generated/prisma/client.js';
import { addDays, addMonths, daysBetweenInclusive, endOfMonth, startOfMonth } from './period-utils';

const { Decimal } = Prisma;
export type DecimalLike = Prisma.Decimal;

export interface AccrualPeriod {
  periodStart: Date;
  periodEnd: Date;
  isFullMonth: boolean;
}

export function generateMonthlyPeriods(startDate: Date, endDate: Date): AccrualPeriod[] {
  if (startDate > endDate) return [];
  const periods: AccrualPeriod[] = [];
  let cursor = startOfMonth(startDate);
  while (cursor <= endDate) {
    const monthStart = cursor;
    const monthEnd = endOfMonth(cursor);
    const periodStart = monthStart < startDate ? startDate : monthStart;
    const periodEnd = monthEnd > endDate ? endDate : monthEnd;
    periods.push({ periodStart, periodEnd, isFullMonth: isFullMonthAccrualPeriod(periodStart, periodEnd) });
    cursor = addMonths(cursor, 1);
  }
  return periods;
}

function isAugustConventionalEnd(date: Date): boolean {
  return date.getUTCMonth() === 7 && date.getUTCDate() === 30;
}

export function isFullMonthAccrualPeriod(periodStart: Date, periodEnd: Date): boolean {
  const monthStart = startOfMonth(periodStart);
  const monthEnd = endOfMonth(periodStart);
  const endsAtMonthBoundary = periodEnd.getTime() === monthEnd.getTime() || isAugustConventionalEnd(periodEnd);
  return periodStart.getTime() === monthStart.getTime() && endsAtMonthBoundary;
}

export interface AccrualTerms {
  rentAmount: DecimalLike;
  utilitiesAmount: DecimalLike;
  dailyRateAmount: DecimalLike;
}

export function computeAccrualAmounts(
  period: AccrualPeriod,
  terms: AccrualTerms,
): { rentAmount: DecimalLike; utilitiesAmount: DecimalLike } {
  if (period.isFullMonth) {
    return { rentAmount: terms.rentAmount, utilitiesAmount: terms.utilitiesAmount };
  }

  const days = daysBetweenInclusive(period.periodStart, period.periodEnd);
  const fullMonthTotal = terms.rentAmount.plus(terms.utilitiesAmount);
  const dailyTotal = terms.dailyRateAmount.times(days);
  const total = dailyTotal.lessThan(fullMonthTotal) ? dailyTotal : fullMonthTotal;

  if (fullMonthTotal.isZero()) {
    return { rentAmount: new Decimal(0), utilitiesAmount: new Decimal(0) };
  }
  const rentShare = terms.rentAmount.div(fullMonthTotal);
  const rentAmount = total.times(rentShare).toDecimalPlaces(2);
  const utilitiesAmount = total.minus(rentAmount);
  return { rentAmount, utilitiesAmount };
}

export interface MatCapitalWindow {
  coveredFrom: Date | null;
  coveredTo: Date | null;
  deferredUntil: Date | null;
}

export function computeDueDate(period: AccrualPeriod, paymentDueDay: number, matCapital?: MatCapitalWindow): Date {
  if (
    matCapital?.coveredFrom &&
    matCapital.coveredTo &&
    matCapital.deferredUntil &&
    period.periodStart >= matCapital.coveredFrom &&
    period.periodStart <= matCapital.coveredTo
  ) {
    return matCapital.deferredUntil;
  }
  const y = period.periodStart.getUTCFullYear();
  const m = period.periodStart.getUTCMonth();
  const regularDueDate = new Date(Date.UTC(y, m, paymentDueDay));
  return period.periodStart > regularDueDate ? period.periodStart : regularDueDate;
}

export interface GeneratedAccrual {
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  rentAmount: DecimalLike;
  utilitiesAmount: DecimalLike;
}

export function computeDailyOnlyAccrualAmount(period: AccrualPeriod, dailyRateAmount: DecimalLike): DecimalLike {
  const days = daysBetweenInclusive(period.periodStart, period.periodEnd);
  return dailyRateAmount.times(days).toDecimalPlaces(2);
}

export function buildAccrualsForContract(params: {
  startDate: Date;
  endDate: Date;
  terms: AccrualTerms & { paymentDueDay: number };
  matCapital?: MatCapitalWindow;
  dailyOnly?: boolean;
}): GeneratedAccrual[] {
  return generateMonthlyPeriods(params.startDate, params.endDate).map((period) => {
    const { rentAmount, utilitiesAmount } = params.dailyOnly
      ? { rentAmount: computeDailyOnlyAccrualAmount(period, params.terms.dailyRateAmount), utilitiesAmount: new Decimal(0) }
      : computeAccrualAmounts(period, params.terms);
    const dueDate = computeDueDate(period, params.terms.paymentDueDay, params.matCapital);
    return { periodStart: period.periodStart, periodEnd: period.periodEnd, dueDate, rentAmount, utilitiesAmount };
  });
}

export const PENALTY_START_DAY = 10;
export const PENALTY_DAILY_RATE = new Decimal('0.0014');

export function penaltyStartsAt(periodStart: Date): Date {
  const y = periodStart.getUTCFullYear();
  const m = periodStart.getUTCMonth();
  return new Date(Date.UTC(y, m + 1, PENALTY_START_DAY));
}

