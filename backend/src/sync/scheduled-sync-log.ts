import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getErrorMessage } from './sync.errors';
import { Prisma } from '../../generated/prisma/client.js';

export interface ScheduledSyncOutcome {
  details: Record<string, unknown>;
  errorMessage?: string;
}

export async function logScheduledSync(
  prisma: PrismaService,
  logger: Logger,
  type: string,
  task: () => Promise<ScheduledSyncOutcome>,
): Promise<void> {
  const log = await prisma.syncLog.create({
    data: { type, trigger: 'CRON', status: 'RUNNING' },
    select: { id: true },
  });
  try {
    const result = await task();
    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: result.errorMessage ? 'FAILED' : 'SUCCESS',
        finishedAt: new Date(),
        details: result.details as Prisma.InputJsonValue,
        errorMessage: result.errorMessage ?? null,
      },
    });
  } catch (error) {
    const message = getErrorMessage(error);
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: 'FAILED', finishedAt: new Date(), errorMessage: message },
    }).catch(() => undefined);
    logger.error(`${type}: ${message}`);
  }
}
