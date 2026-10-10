import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { syncResidentRoles } from '../users/resident-role-sync';
import { getErrorMessage, sanitizeErrorStack, SyncAlreadyRunningError } from './sync.errors';
import type { SyncTriggerType } from './sync.service';

const TYPE = 'resident-roles';
const LOCK_STALE_MS = 30 * 60 * 1_000;

@Injectable()
export class ResidentRolesSyncService {
  private readonly logger = new Logger(ResidentRolesSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async runSync(trigger: SyncTriggerType): Promise<{ status: 'SUCCESS'; processed: number; granted: number; revoked: number }> {
    try {
      await this.prisma.syncLock.create({ data: { type: TYPE } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const staleBefore = new Date(Date.now() - LOCK_STALE_MS);
      const deleted = await this.prisma.syncLock.deleteMany({ where: { type: TYPE, startedAt: { lt: staleBefore } } });
      if (deleted.count === 0) throw new SyncAlreadyRunningError();
      try {
        await this.prisma.syncLock.create({ data: { type: TYPE } });
      } catch (raceError) {
        if (raceError instanceof Prisma.PrismaClientKnownRequestError && raceError.code === 'P2002') throw new SyncAlreadyRunningError();
        throw raceError;
      }
    }

    try {
      const log = await this.prisma.syncLog.create({ data: { type: TYPE, trigger, status: 'RUNNING' } });
      try {
        const result = await syncResidentRoles(this.prisma);
        await this.prisma.syncLog.update({
          where: { id: log.id },
          data: {
            status: 'SUCCESS', finishedAt: new Date(), fetchedCount: result.processed,
            added: result.granted, updated: 0, removed: result.revoked,
            details: result,
          },
        });
        this.logger.log(`Роли проживающих: проверено ${result.processed}, выдано ${result.granted}, отозвано ${result.revoked}`);
        return { status: 'SUCCESS', ...result };
      } catch (error) {
        await this.prisma.syncLog.update({
          where: { id: log.id },
          data: { status: 'FAILED', finishedAt: new Date(), errorMessage: getErrorMessage(error), errorStack: sanitizeErrorStack(error) },
        });
        throw error;
      }
    } finally {
      await this.prisma.syncLock.deleteMany({ where: { type: TYPE } });
    }
  }
}
