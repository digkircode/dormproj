import { Prisma } from '../../generated/prisma/client.js';
import { addDays, addMonths, daysBetweenInclusive, endOfMonth, startOfMonth } from './period-utils';

const { Decimal } = Prisma;
export type DecimalLike = Prisma.Decimal;

export interface AccrualPeriod {
  periodStart: Date;
  periodEnd: Date;
  isFullMonth: boolean;
}

// Разбивает [startDate, endDate] на календарные месяцы — все периоды "полные", кроме,
// возможно, первого (заселение не с 1-го числа) и последнего (выезд не по конец месяца).
// Взимается плата за весь срок действия договора, включая каникулы (п. 4.5/5.6) — поэтому
// периоды генерируются по датам договора, не по факту присутствия.
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

// periodEnd < конца календарного месяца означает, что период обрезан по дате договора
// (заселение/выезд не по границе месяца) — обычно это триггерит посуточный расчёт.
// Исключение: договоры по умолчанию заканчиваются 30 августа, не 31-го (см. Contracts.vue),
// это типовая, а не укороченная дата конца месяца — не должна давать посуточный расчёт
// последнего месяца. Вынесено отдельной функцией (не только для generateMonthlyPeriods) —
// нужна и в billing/penalty.scheduler.ts, чтобы отличить обычное полное начисление (база
// пени — фиксированная стоимость комнаты, см. penalty.scheduler.ts) от посуточного (база —
// фактически начисленная сумма) уже по готовому Accrual, без доступа к исходному cursor.
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

// Полный месяц — берём условия договора как есть. Неполный (п. 4.2/5.2) — посуточно по
// dailyRateAmount, но не больше полной месячной суммы найм+коммуналка. Договор не делит
// суточную ставку на найм/коммуналку отдельно — делим пропорционально долям из полной
// месячной суммы, чтобы у начисления всегда были оба компонента (нужно для отчётов
// отдельно по найму/коммуналке).
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

// Обычно — paymentDueDay число того же месяца, что и период (п. 4.4/5.4 — всегда 5, но
// берём из условий договора). Если период попадает в диапазон, закрытый маткапиталом —
// срок сдвигается на согласованную дату отсрочки (see Contract.matCapitalDeferredUntil).
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
  return new Date(Date.UTC(y, m, paymentDueDay));
}

export interface GeneratedAccrual {
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  rentAmount: DecimalLike;
  utilitiesAmount: DecimalLike;
}

// Комнаты без месячной "Стоимости" (см. room-characteristic-definitions) — целиком
// посуточные (112-2/410-2 на момент введения, но список комнат не хардкодим нигде в этом
// файле, признак — отсутствие обеих характеристик "Стоимость (из/не из вуза)" у комнаты,
// см. contracts.controller.ts). В отличие от обычного договора, где посуточно считается
// только неполный крайний месяц (см. computeAccrualAmounts), здесь КАЖДЫЙ период — посуточно
// и без потолка "не больше полной месячной суммы" (полной месячной суммы просто нет).
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

// Пеня начинает копиться с 10 числа месяца, СЛЕДУЮЩЕГО за расчётным месяцем начисления
// (не через N дней от dueDate) — например, не оплатили начисление за сентябрь
// (periodStart = 1 сентября) к 5 сентября -> пеня стартует 10 октября, а не 10 сентября.
export const PENALTY_START_DAY = 10;
export const PENALTY_DAILY_RATE = new Decimal('0.0014');

export function penaltyStartsAt(periodStart: Date): Date {
  const y = periodStart.getUTCFullYear();
  const m = periodStart.getUTCMonth();
  return new Date(Date.UTC(y, m + 1, PENALTY_START_DAY));
}

