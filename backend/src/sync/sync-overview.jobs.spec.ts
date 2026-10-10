import { dailyScheduleWindow, nextMonthStartMoscow } from './sync-overview.jobs';

describe('Moscow sync schedule', () => {
  it('uses the new Moscow day at 21:00 UTC', () => {
    const before = dailyScheduleWindow(new Date('2026-10-09T21:30:00.000Z'), 1, 0);
    expect(before.previous.toISOString()).toBe('2026-10-08T22:00:00.000Z');
    expect(before.next.toISOString()).toBe('2026-10-09T22:00:00.000Z');
    const after = dailyScheduleWindow(new Date('2026-10-09T22:30:00.000Z'), 1, 0);
    expect(after.previous.toISOString()).toBe('2026-10-09T22:00:00.000Z');
    expect(after.next.toISOString()).toBe('2026-10-10T22:00:00.000Z');
  });

  it('moves the monthly run to the following month after Moscow midnight', () => {
    expect(nextMonthStartMoscow(new Date('2026-10-31T20:59:00.000Z')).toISOString()).toBe('2026-10-31T21:00:00.000Z');
    expect(nextMonthStartMoscow(new Date('2026-10-31T21:01:00.000Z')).toISOString()).toBe('2026-11-30T21:00:00.000Z');
  });
});
