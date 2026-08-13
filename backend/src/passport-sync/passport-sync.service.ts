import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { getErrorMessage, SyncAlreadyRunningError } from '../sync/sync.errors';
import type { SyncTriggerType } from '../sync/sync.service';
import { ExternalPassportApiService } from './external-passport-api.service';
import { toPassportData } from './passport.mapper';
import {
  LOCK_STALE_MS,
  SYNC_TYPE_PASSPORT,
  TRANSACTION_TIMEOUT_MS,
} from './passport-sync.constants';

export interface PassportSyncResult {
  status: 'SUCCESS';
  fetchedCount: number;
  added: number;
  updated: number;
  removed: number;
  startedAt: Date;
  finishedAt: Date;
}

@Injectable()
export class PassportSyncService {
  private readonly logger = new Logger(PassportSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly externalApi: ExternalPassportApiService,
  ) {}

  async runSync(trigger: SyncTriggerType): Promise<PassportSyncResult> {
    await this.acquireLock();

    const log = await this.prisma.syncLog.create({
      data: { type: SYNC_TYPE_PASSPORT, trigger, status: 'RUNNING' },
    });

    try {
      // Ручные физлица (isManual) не отправляем в 1С — у них нет реального UID источника.
      const individuals = await this.prisma.individual.findMany({
        where: { isManual: false },
        select: { fizicheskoyeLitsoUid: true },
      });
      const uids = individuals.map((i) => i.fizicheskoyeLitsoUid);

      const records = await this.externalApi.fetchPassports(uids);

      // Слепок, а не апсерт по ключу — у истории паспортных данных нет стабильного UID
      // (несколько документов на одно физлицо), поэтому каждый запуск полностью
      // очищает и заново заполняет таблицу (как citizenships/students).
      const { added, removed } = await this.prisma.$transaction(
        async (tx) => {
          const existingCount = await tx.passport.count();

          await tx.passport.deleteMany({});

          if (records.length > 0) {
            await tx.passport.createMany({
              data: records.map((record) => toPassportData(record)),
            });
          }

          return { added: records.length, removed: existingCount };
        },
        { timeout: TRANSACTION_TIMEOUT_MS },
      );

      const finishedAt = new Date();
      await this.prisma.syncLog.update({
        where: { id: log.id },
        data: {
          status: 'SUCCESS',
          finishedAt,
          fetchedCount: records.length,
          added,
          updated: 0,
          removed,
        },
      });

      this.logger.log(
        `Синхронизация паспортных данных завершена: запрошено ${uids.length} UID, очищено ${removed}, записано ${added}`,
      );

      return {
        status: 'SUCCESS',
        fetchedCount: records.length,
        added,
        updated: 0,
        removed,
        startedAt: log.startedAt,
        finishedAt,
      };
    } catch (error) {
      await this.prisma.syncLog.update({
        where: { id: log.id },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          errorMessage: getErrorMessage(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        },
      });
      throw error;
    } finally {
      await this.releaseLock();
    }
  }

  private async acquireLock(): Promise<void> {
    try {
      await this.prisma.syncLock.create({
        data: { type: SYNC_TYPE_PASSPORT },
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }

      const existingLock = await this.prisma.syncLock.findUnique({
        where: { type: SYNC_TYPE_PASSPORT },
      });
      const isStale =
        existingLock &&
        Date.now() - existingLock.startedAt.getTime() > LOCK_STALE_MS;

      if (!isStale) {
        throw new SyncAlreadyRunningError();
      }

      this.logger.warn(
        `Найден зависший лок синхронизации паспортных данных (старше ${LOCK_STALE_MS / 60000} мин) — считаю его брошенным и перехватываю`,
      );
      await this.prisma.syncLock.deleteMany({
        where: { type: SYNC_TYPE_PASSPORT },
      });

      try {
        await this.prisma.syncLock.create({
          data: { type: SYNC_TYPE_PASSPORT },
        });
      } catch (raceError) {
        if (
          raceError instanceof Prisma.PrismaClientKnownRequestError &&
          raceError.code === 'P2002'
        ) {
          throw new SyncAlreadyRunningError();
        }
        throw raceError;
      }
    }
  }

  private async releaseLock(): Promise<void> {
    await this.prisma.syncLock.deleteMany({
      where: { type: SYNC_TYPE_PASSPORT },
    });
  }

  async getRecentLogs(limit = 20) {
    return this.prisma.syncLog.findMany({
      where: { type: SYNC_TYPE_PASSPORT },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  }
}
