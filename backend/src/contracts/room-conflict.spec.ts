import { hasConflictingStay } from './room-conflict';

const date = (day: number) => new Date(Date.UTC(2026, 0, day));
const stay = (from: number, end: number, to: number | null = null, actual: number | null = null) => ({
  fromDate: date(from), toDate: to === null ? null : date(to),
  contract: { startDate: date(from), endDate: date(end), actualEndDate: actual === null ? null : date(actual) },
});

describe('resident room conflict', () => {
  it('blocks overlapping rooms, including the same move-in date', () => {
    expect(hasConflictingStay(date(5), date(20), [stay(1, 15)])).toBe(true);
    expect(hasConflictingStay(date(5), date(20), [stay(5, 30)])).toBe(true);
    expect(hasConflictingStay(date(5), date(5), [stay(5, 5)])).toBe(true);
  });
  it('allows a move on the departure date and respects actual departure', () => {
    expect(hasConflictingStay(date(15), date(30), [stay(1, 15)])).toBe(false);
    expect(hasConflictingStay(date(11), date(30), [stay(1, 30, 10, 10)])).toBe(false);
  });
});
