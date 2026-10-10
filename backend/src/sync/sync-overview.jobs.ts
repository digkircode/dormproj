import { Prisma } from '../../generated/prisma/client.js';

export type SyncGroup = 'UNIVERSITY' | 'PORTAL' | 'ACCOUNTING' | 'HOSTEL';
export type SyncSchedule = { kind: 'DAILY'; hour: number; minute: number } | { kind: 'CHAIN'; hour: number; minute: number; afterJobId: string } | { kind: 'MANUAL' } | { kind: 'STARTUP' };

export interface SyncJobDefinition {
  id: string;
  group: SyncGroup;
  type: string;
  schedule: SyncSchedule;
  operations?: string[];
  configuration?: 'PUSH' | 'FETCH' | 'DOCUMENTS' | 'PORTAL';
  manualPath?: string;
}

export const SYNC_JOBS: SyncJobDefinition[] = [
  { id: 'students', group: 'UNIVERSITY', type: 'students', schedule: { kind: 'DAILY', hour: 1, minute: 0 }, manualPath: '/sync/students' },
  { id: 'individuals', group: 'UNIVERSITY', type: 'individuals', schedule: { kind: 'CHAIN', hour: 1, minute: 0, afterJobId: 'students' }, manualPath: '/sync/individuals' },
  { id: 'citizenship', group: 'UNIVERSITY', type: 'citizenship', schedule: { kind: 'CHAIN', hour: 1, minute: 0, afterJobId: 'individuals' }, manualPath: '/sync/citizenship' },
  { id: 'passport', group: 'UNIVERSITY', type: 'passport', schedule: { kind: 'CHAIN', hour: 1, minute: 0, afterJobId: 'citizenship' }, manualPath: '/sync/passport' },
  { id: 'contact-info', group: 'UNIVERSITY', type: 'contact-info', schedule: { kind: 'CHAIN', hour: 1, minute: 0, afterJobId: 'passport' }, manualPath: '/sync/contact-info' },
  { id: 'portal-users', group: 'PORTAL', type: 'portal-users', schedule: { kind: 'CHAIN', hour: 1, minute: 0, afterJobId: 'contact-info' }, configuration: 'PORTAL', manualPath: '/sync/portal-users' },
  { id: 'resident-roles', group: 'HOSTEL', type: 'resident-roles', schedule: { kind: 'CHAIN', hour: 1, minute: 0, afterJobId: 'portal-users' }, manualPath: '/sync/resident-roles' },
  { id: 'individual', group: 'UNIVERSITY', type: 'individual', schedule: { kind: 'MANUAL' } },
  { id: 'accounting-payment-push', group: 'ACCOUNTING', type: 'accounting-payment-push', schedule: { kind: 'DAILY', hour: 2, minute: 30 }, configuration: 'PUSH' },
  { id: 'accounting-payment-import', group: 'ACCOUNTING', type: 'accounting-payment-import', schedule: { kind: 'DAILY', hour: 3, minute: 0 }, configuration: 'FETCH' },
  { id: 'service-provision-preparation', group: 'ACCOUNTING', type: 'service-provision-documents', operations: ['CREATE_CURRENT_MONTH', 'DAILY_RECALCULATION'], schedule: { kind: 'DAILY', hour: 3, minute: 0 } },
  { id: 'service-provision-send', group: 'ACCOUNTING', type: 'service-provision-documents', operations: ['FINAL_RECALC_AND_SEND', 'RETRY_PREVIOUS_MONTH'], schedule: { kind: 'DAILY', hour: 23, minute: 55 }, configuration: 'DOCUMENTS' },
  { id: 'service-provision-recovery', group: 'ACCOUNTING', type: 'service-provision-documents', operations: ['STARTUP_RECOVERY'], schedule: { kind: 'STARTUP' } },
  { id: 'contract-status', group: 'HOSTEL', type: 'contract-status', schedule: { kind: 'DAILY', hour: 1, minute: 30 } },
  { id: 'penalties', group: 'HOSTEL', type: 'penalties', schedule: { kind: 'DAILY', hour: 2, minute: 0 } },
];

export function syncJobWhere(job: SyncJobDefinition): Prisma.SyncLogWhereInput {
  return {
    type: job.type,
    ...(job.operations ? {
      OR: job.operations.map((operation) => ({ details: { path: ['operation'], equals: operation } })),
    } : {}),
  };
}

// Moscow has a fixed UTC+03:00 offset. Keep the calculation on the server so all
// clients see the same upcoming run, regardless of their own time zone.
export function dailyScheduleWindow(now: Date, hour: number, minute: number): { previous: Date; next: Date } {
  const moscowNow = new Date(now.getTime() + 3 * 60 * 60_000);
  const today = Date.UTC(moscowNow.getUTCFullYear(), moscowNow.getUTCMonth(), moscowNow.getUTCDate(), hour - 3, minute);
  const previous = today <= now.getTime() ? today : today - 86_400_000;
  return { previous: new Date(previous), next: new Date(previous + 86_400_000) };
}

export function nextMonthStartMoscow(now: Date): Date {
  const moscowNow = new Date(now.getTime() + 3 * 60 * 60_000);
  const thisMonth = Date.UTC(moscowNow.getUTCFullYear(), moscowNow.getUTCMonth(), 1, -3);
  return new Date(thisMonth > now.getTime()
    ? thisMonth
    : Date.UTC(moscowNow.getUTCFullYear(), moscowNow.getUTCMonth() + 1, 1, -3));
}
