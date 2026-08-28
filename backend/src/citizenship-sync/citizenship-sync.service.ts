import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { getErrorMessage, sanitizeErrorStack, SyncAlreadyRunningError } from '../sync/sync.errors';
import type { SyncTriggerType } from '../sync/sync.service';
import { ExternalCitizenshipApiService } from './external-citizenship-api.service';
import { toCitizenshipData } from './citizenship.mapper';
import {
  LOCK_STALE_MS,
  SYNC_TYPE_CITIZENSHIP,
  TRANSACTION_TIMEOUT_MS,
} from './citizenship-sync.constants';
import { listSyncLogs, syncLogFacetValues, type SyncLogsListQuery } from '../sync/sync-logs-list';

export interface CitizenshipSyncResult {
  status: 'SUCCESS';
  fetchedCount: number;
  added: number;
  updated: number;
  removed: number;
  startedAt: Date;
  finishedAt: Date;
}

@Injectable()
export class CitizenshipSyncService {
  private readonly logger = new Logger(CitizenshipSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly externalApi: ExternalCitizenshipApiService,
  ) {}

  async runSync(trigger: SyncTriggerType): Promise<CitizenshipSyncResult> {
    await this.acquireLock();

    const log = await this.prisma.syncLog.create({
      data: { type: SYNC_TYPE_CITIZENSHIP, trigger, status: 'RUNNING' },
    });

    try {
      // Ручные физлица (isManual) не отправляем в 1С — у них нет реального UID источника.
      const individuals = await this.prisma.individual.findMany({
        where: { isManual: false },
        select: { fizicheskoyeLitsoUid: true },
      });
      const uids = individuals.map((i) => i.fizicheskoyeLitsoUid);

      const records = await this.externalApi.fetchCitizenships(uids);

      // Слепок, а не апсерт по ключу — у истории гражданства нет стабильного UID
      // (несколько периодов на одно физлицо), поэтому каждый запуск полностью
      // очищает и заново заполняет таблицу (как students после недавнего рефакторинга).
      const { added, removed } = await this.prisma.$transaction(
        async (tx) => {
          const existingCount = await tx.citizenship.count();

          await tx.citizenship.deleteMany({});

          if (records.length > 0) {
            await tx.citizenship.createMany({
              data: records.map((record) => toCitizenshipData(record)),
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
        `Синхронизация гражданства завершена: запрошено ${uids.length} UID, очищено ${removed}, записано ${added}`,
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
          errorStack: sanitizeErrorStack(error),
        },
      });
      throw error;
    } finally {
      await this.releaseLock();
    }
  }

  // Точечная синхронизация одного физлица (кнопка на карточке) — та же логика "слепка",
  // что и в общем прогоне, но удаляет и заново пишет только строки этого UID, а не всю
  // таблицу. Без отдельного SyncLog — это шаг общего лога IndividualSyncService.
  async syncOne(uid: string): Promise<{ fetchedCount: number; added: number; removed: number; records: unknown[] }> {
    const records = await this.externalApi.fetchCitizenships([uid]);

    return this.prisma.$transaction(
      async (tx) => {
        const existingCount = await tx.citizenship.count({ where: { fizicheskoyeLitsoUid: uid } });
        await tx.citizenship.deleteMany({ where: { fizicheskoyeLitsoUid: uid } });

        if (records.length > 0) {
          await tx.citizenship.createMany({ data: records.map((record) => toCitizenshipData(record)) });
        }

        return { fetchedCount: records.length, added: records.length, removed: existingCount, records };
      },
      { timeout: TRANSACTION_TIMEOUT_MS },
    );
  }

  private async acquireLock(): Promise<void> {
    try {
      await this.prisma.syncLock.create({
        data: { type: SYNC_TYPE_CITIZENSHIP },
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }

      const existingLock = await this.prisma.syncLock.findUnique({
        where: { type: SYNC_TYPE_CITIZENSHIP },
      });
      const isStale =
        existingLock &&
        Date.now() - existingLock.startedAt.getTime() > LOCK_STALE_MS;

      if (!isStale) {
        throw new SyncAlreadyRunningError();
      }

      this.logger.warn(
        `Найден зависший лок синхронизации гражданства (старше ${LOCK_STALE_MS / 60000} мин) — считаю его брошенным и перехватываю`,
      );
      await this.prisma.syncLock.deleteMany({
        where: { type: SYNC_TYPE_CITIZENSHIP },
      });

      try {
        await this.prisma.syncLock.create({
          data: { type: SYNC_TYPE_CITIZENSHIP },
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
      where: { type: SYNC_TYPE_CITIZENSHIP },
    });
  }

  async listLogs(query: SyncLogsListQuery) {
    return listSyncLogs(this.prisma, SYNC_TYPE_CITIZENSHIP, query);
  }

  async logFacetValues(field: string) {
    return syncLogFacetValues(this.prisma, SYNC_TYPE_CITIZENSHIP, field);
  }
}
