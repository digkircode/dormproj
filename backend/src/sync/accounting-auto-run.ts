import { PrismaService } from '../prisma/prisma.service';

export const ACCOUNTING_AUTO_RUN_JOBS = [
  'accounting-payment-push',
  'accounting-payment-import',
  'service-provision-preparation',
  'service-provision-send',
  'service-provision-recovery',
] as const;

export type AccountingAutoRunJob = (typeof ACCOUNTING_AUTO_RUN_JOBS)[number];

export async function isAccountingAutoRunEnabled(prisma: PrismaService, jobId: AccountingAutoRunJob): Promise<boolean> {
  const setting = await prisma.syncJobSetting.findUnique({ where: { jobId }, select: { enabled: true } });
  return setting?.enabled ?? true;
}
