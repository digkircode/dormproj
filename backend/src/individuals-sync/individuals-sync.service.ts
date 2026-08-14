import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { getErrorMessage, SyncAlreadyRunningError } from '../sync/sync.errors';
import type { SyncTriggerType } from '../sync/sync.service';
import { ExternalIndividualApiService } from './external-individual-api.service';
import { toIndividualData } from './individual.mapper';
import {
  LOCK_STALE_MS,
  SYNC_TYPE_INDIVIDUALS,
  TRANSACTION_TIMEOUT_MS,
} from './individuals-sync.constants';
import { listSyncLogs, syncLogFacetValues, type SyncLogsListQuery } from '../sync/sync-logs-list';

export interface IndividualsSyncResult {
  status: 'SUCCESS';
  fetchedCount: number;
  added: number;
  updated: number;
  removed: number;
  startedAt: Date;
  finishedAt: Date;
}

@Injectable()
export class IndividualsSyncService {
  private readonly logger = new Logger(IndividualsSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly externalApi: ExternalIndividualApiService,
  ) {}

  async runSync(trigger: SyncTriggerType): Promise<IndividualsSyncResult> {
    await this.acquireLock();

    const log = await this.prisma.syncLog.create({
      data: { type: SYNC_TYPE_INDIVIDUALS, trigger, status: 'RUNNING' },
    });

    try {
      const uids = await this.collectUids();

      const records = await this.externalApi.fetchIndividuals(uids);

      const { added, updated } = await this.prisma.$transaction(
        async (tx) => {
          const existingUids = new Set(
            (
              await tx.individual.findMany({
                where: { fizicheskoyeLitsoUid: { in: uids } },
                select: { fizicheskoyeLitsoUid: true },
              })
            ).map((r) => r.fizicheskoyeLitsoUid),
          );

          let added = 0;
          let updated = 0;

          for (const record of records) {
            if (existingUids.has(record.FizicheskoyeLitsoUID)) {
              updated++;
            } else {
              added++;
            }

            const data = toIndividualData(record);
            await tx.individual.upsert({
              where: { fizicheskoyeLitsoUid: record.FizicheskoyeLitsoUID },
              create: {
                fizicheskoyeLitsoUid: record.FizicheskoyeLitsoUID,
                ...data,
              },
              update: data,
            });
          }

          // Намеренно без deleteMany — в отличие от студентов, физлица не удаляются:
          // пропавшая из ответа или помеченная DeleteMark=true запись остаётся как есть.
          return { added, updated };
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
          updated,
          removed: 0,
        },
      });

      this.logger.log(
        `Синхронизация физлиц завершена: запрошено ${uids.length} UID, получено ${records.length}, добавлено ${added}, обновлено ${updated}`,
      );

      return {
        status: 'SUCCESS',
        fetchedCount: records.length,
        added,
        updated,
        removed: 0,
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
        data: { type: SYNC_TYPE_INDIVIDUALS },
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }

      const existingLock = await this.prisma.syncLock.findUnique({
        where: { type: SYNC_TYPE_INDIVIDUALS },
      });
      const isStale =
        existingLock &&
        Date.now() - existingLock.startedAt.getTime() > LOCK_STALE_MS;

      if (!isStale) {
        throw new SyncAlreadyRunningError();
      }

      this.logger.warn(
        `Найден зависший лок синхронизации физлиц (старше ${LOCK_STALE_MS / 60000} мин) — считаю его брошенным и перехватываю`,
      );
      await this.prisma.syncLock.deleteMany({
        where: { type: SYNC_TYPE_INDIVIDUALS },
      });

      try {
        await this.prisma.syncLock.create({
          data: { type: SYNC_TYPE_INDIVIDUALS },
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
      where: { type: SYNC_TYPE_INDIVIDUALS },
    });
  }

  async listLogs(query: SyncLogsListQuery) {
    return listSyncLogs(this.prisma, SYNC_TYPE_INDIVIDUALS, query);
  }

  async logFacetValues(field: string) {
    return syncLogFacetValues(this.prisma, SYNC_TYPE_INDIVIDUALS, field);
  }

  // UID берём не только из активных студентов, но и из уже засинканных физлиц —
  // иначе после отчисления (студент пропадает из students при полной перезаписи)
  // его физлицо переставало бы обновляться. isManual=true — записи, заведённые
  // вручную на сайте, а не из 1С — их UID в источник не отправляем.
  private async collectUids(): Promise<string[]> {
    const [students, syncedIndividuals] = await Promise.all([
      this.prisma.student.findMany({
        select: { fizicheskoyeLitsoUid: true },
        distinct: ['fizicheskoyeLitsoUid'],
      }),
      this.prisma.individual.findMany({
        where: { isManual: false },
        select: { fizicheskoyeLitsoUid: true },
      }),
    ]);

    return Array.from(
      new Set([
        ...students.map((s) => s.fizicheskoyeLitsoUid),
        ...syncedIndividuals.map((i) => i.fizicheskoyeLitsoUid),
      ]),
    );
  }
}
