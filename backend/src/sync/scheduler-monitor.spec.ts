import { monthlyRunState, scheduledRunState } from './scheduler-monitor';

describe('scheduler monitor', () => {
  const beforeFirstRun = new Date('2026-10-29T00:00:00Z');

  it('waits for the first run after backend startup, then detects a miss', () => {
    expect(scheduledRunState(new Date('2026-10-29T01:00:00Z'), beforeFirstRun, null, 3, 0).state).toBe('WAITING');
    expect(scheduledRunState(new Date('2026-10-29T03:01:00Z'), beforeFirstRun, null, 3, 0).state).toBe('MISSED');
  });

  it('recognizes a CRON record and retains a missed run across restart', () => {
    const now = new Date('2026-10-29T03:01:00Z');
    expect(scheduledRunState(now, beforeFirstRun, new Date('2026-10-29T00:01:00Z'), 3, 0).state).toBe('RECORDED');
    expect(scheduledRunState(now, new Date('2026-10-29T02:00:00Z'), new Date('2026-10-28T00:01:00Z'), 3, 0).state).toBe('MISSED');
  });

  it('does not claim a run was missed before the first schedule after startup', () => {
    const started = new Date('2026-10-29T02:00:00Z');
    const result = scheduledRunState(new Date('2026-10-29T04:00:00Z'), started, null, 3, 0);
    expect(result.state).toBe('WAITING');
    expect(result.expectedAt.toISOString()).toBe('2026-10-30T00:00:00.000Z');
  });

  it('tracks the monthly cron after the first of the month', () => {
    const now = new Date('2026-11-01T00:01:00Z');
    expect(monthlyRunState(now, new Date('2026-10-29T00:00:00Z'), null).state).toBe('MISSED');
    expect(monthlyRunState(now, new Date('2026-10-29T00:00:00Z'), new Date('2026-10-31T21:01:00Z')).state).toBe('RECORDED');
  });
});
