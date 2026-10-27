import { computeDueDate, generateMonthlyPeriods } from './accrual-generation';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe('accrual payment due dates', () => {
  it('uses the fifth for a stay starting before the fifth', () => {
    const [first] = generateMonthlyPeriods(day('2026-11-01'), day('2026-11-30'));
    expect(computeDueDate(first, 5)).toEqual(day('2026-11-05'));
  });

  it('uses the move-in date for the first month after the fifth and the fifth thereafter', () => {
    const [first, second] = generateMonthlyPeriods(day('2026-11-08'), day('2026-12-31'));
    expect(computeDueDate(first, 5)).toEqual(day('2026-11-08'));
    expect(computeDueDate(second, 5)).toEqual(day('2026-12-05'));
  });

  it('keeps the capital deferral for covered months and returns to the fifth afterward', () => {
    const [first, second] = generateMonthlyPeriods(day('2026-11-01'), day('2026-12-31'));
    const capital = {
      coveredFrom: day('2026-11-01'), coveredTo: day('2026-11-30'), deferredUntil: day('2026-11-30'),
    };
    expect(computeDueDate(first, 5, capital)).toEqual(day('2026-11-30'));
    expect(computeDueDate(second, 5, capital)).toEqual(day('2026-12-05'));
  });
});
