import { dailyScheduleWindow, nextMonthStartMoscow } from './sync-overview.jobs';

export const SCHEDULED_CRON_JOBS = [
  { name: 'sync-students', jobId: 'students', hour: 1, minute: 0 },
  { name: 'sync-accounting-payment-push', jobId: 'accounting-payment-push', hour: 2, minute: 30 },
  { name: 'sync-accounting-payment-import', jobId: 'accounting-payment-import', hour: 3, minute: 0 },
  { name: 'sync-service-provision-monthly', jobId: null, hour: null, minute: null },
  { name: 'sync-service-provision-preparation', jobId: 'service-provision-preparation', hour: 3, minute: 0 },
  { name: 'sync-service-provision-send', jobId: 'service-provision-send', hour: 23, minute: 55 },
  { name: 'sync-contract-status', jobId: 'contract-status', hour: 1, minute: 30 },
  { name: 'sync-penalties', jobId: 'penalties', hour: 2, minute: 0 },
  { name: 'sync-penalty-reconciliation', jobId: 'penalty-reconciliation', hour: 0, minute: 30 },
] as const;

export type ScheduledRunState = 'WAITING' | 'RECORDED' | 'MISSED';
const GRACE_MS = 2 * 60 * 60_000;

export function scheduledRunState(now: Date, startedAt: Date, lastCronAt: Date | null, hour: number, minute: number): {
  state: ScheduledRunState;
  expectedAt: Date;
} {
  const window = dailyScheduleWindow(now, hour, minute);
  return stateForWindow(now, startedAt, lastCronAt, window);
}

export function monthlyRunState(now: Date, startedAt: Date, lastCronAt: Date | null): {
  state: ScheduledRunState;
  expectedAt: Date;
} {
  const moscowNow = new Date(now.getTime() + 3 * 60 * 60_000);
  const previous = new Date(Date.UTC(moscowNow.getUTCFullYear(), moscowNow.getUTCMonth(), 1, -3));
  return stateForWindow(now, startedAt, lastCronAt, { previous, next: nextMonthStartMoscow(now) });
}

function stateForWindow(now: Date, startedAt: Date, lastCronAt: Date | null, window: { previous: Date; next: Date }): {
  state: ScheduledRunState;
  expectedAt: Date;
} {
  // A fresh installation cannot prove a missed run before this backend started.
  const expectedAt = !lastCronAt && window.previous < startedAt ? window.next : window.previous;
  if (lastCronAt && lastCronAt >= expectedAt) return { state: 'RECORDED', expectedAt };
  return { state: now.getTime() > expectedAt.getTime() + GRACE_MS ? 'MISSED' : 'WAITING', expectedAt };
}
