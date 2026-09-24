import { peakOccupancy } from './room-capacity';

const date = (day: number) => new Date(Date.UTC(2026, 8, day));
const stay = (from: number, end: number, to: number | null = null, actual: number | null = null) => ({
  fromDate: date(from), toDate: to === null ? null : date(to),
  contract: { endDate: date(end), actualEndDate: actual === null ? null : date(actual) },
});
describe('room capacity', () => {
  it('counts simultaneous stays, not all intersecting contracts', () => {
    expect(peakOccupancy(date(1), date(30), [stay(1, 10), stay(11, 20)])).toBe(1);
    expect(peakOccupancy(date(1), date(30), [stay(1, 15), stay(10, 20)])).toBe(2);
  });
  it('includes the departure day', () => {
    expect(peakOccupancy(date(10), date(10), [stay(1, 10), stay(10, 20)])).toBe(2);
  });
  it('releases an open assignment after contract expiry', () => {
    expect(peakOccupancy(date(11), date(30), [stay(1, 10)])).toBe(0);
  });
  it('uses actual departure for terminated contracts', () => {
    expect(peakOccupancy(date(11), date(30), [stay(1, 30, 10, 10)])).toBe(0);
    expect(peakOccupancy(date(5), date(9), [stay(1, 30, 10, 10)])).toBe(1);
  });
  it('respects assignment closure and ignores future arrivals', () => {
    expect(peakOccupancy(date(11), date(20), [stay(1, 30, 10), stay(21, 30)])).toBe(0);
  });
});
