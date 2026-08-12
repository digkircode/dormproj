import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { ExternalStudentApiService } from './external-student-api.service';
import { toStudentData } from './student.mapper';
import {
  getErrorMessage,
  SyncAlreadyRunningError,
  SyncGuardTrippedError,
} from './sync.errors';
import {
  LOCK_STALE_MS,
  MIN_SURVIVAL_RATIO,
  SYNC_TYPE_STUDENTS,
  TRANSACTION_TIMEOUT_MS,
} from './sync.constants';

export type SyncTriggerType = 'CRON' | 'MANUAL';

export interface SyncResult {
  status: 'SUCCESS';
  fetchedCount: number;
  added: number;
  updated: number;
  removed: number;
  startedAt: Date;
  finishedAt: Date;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly externalApi: ExternalStudentApiService,
  ) {}

  async runSync(trigger: SyncTriggerType): Promise<SyncResult> {
    await this.acquireLock();

    const log = await this.prisma.syncLog.create({
      data: { type: SYNC_TYPE_STUDENTS, trigger, status: 'RUNNING' },
    });

    try {
      const records = await this.externalApi.fetchActiveStudents();

      const { added, updated, removed } = await this.prisma.$transaction(
        async (tx) => {
          const existingRows = await tx.student.findMany({
            select: { zachetnayaKnigaUid: true, fizicheskoyeLitsoUid: true },
          });

          if (
            existingRows.length > 0 &&
            records.length < existingRows.length * MIN_SURVIVAL_RATIO
          ) {
            throw new SyncGuardTrippedError(
              `Во внешнем API пришло ${records.length} записей, а сейчас в базе ${existingRows.length} студентов — это меньше ${Math.round(MIN_SURVIVAL_RATIO * 100)}% от текущего количества. Похоже на сбой источника, синхронизация остановлена без удаления данных.`,
            );
          }

          const existingMap = new Map(
            existingRows.map((r) => [
              r.zachetnayaKnigaUid,
              r.fizicheskoyeLitsoUid,
            ]),
          );
          let added = 0;
          let updated = 0;

          for (const record of records) {
            const existingLitsoUid = existingMap.get(record.ZachetnayaKnigaUID);

            if (existingLitsoUid === undefined) {
              added++;
            } else {
              updated++;
              if (existingLitsoUid !== record.FizicheskoyeLitsoUID) {
                this.logger.warn(
                  `Аномалия: зачётка ${record.ZachetnayaKnigaUID} раньше была привязана к физлицу ${existingLitsoUid}, теперь пришла с ${record.FizicheskoyeLitsoUID}. Запись обновлена, но стоит проверить вручную.`,
                );
              }
            }

            const data = toStudentData(record);
            await tx.student.upsert({
              where: { zachetnayaKnigaUid: record.ZachetnayaKnigaUID },
              create: {
                zachetnayaKnigaUid: record.ZachetnayaKnigaUID,
                ...data,
              },
              update: data,
            });
          }

          let removed = 0;
          if (records.length > 0) {
            const result = await tx.student.deleteMany({
              where: {
                zachetnayaKnigaUid: {
                  notIn: records.map((r) => r.ZachetnayaKnigaUID),
                },
              },
            });
            removed = result.count;
          }

          return { added, updated, removed };
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
          removed,
        },
      });

      this.logger.log(
        `Синхронизация студентов завершена: получено ${records.length}, добавлено ${added}, обновлено ${updated}, удалено ${removed}`,
      );

      return {
        status: 'SUCCESS',
        fetchedCount: records.length,
        added,
        updated,
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
      await this.prisma.syncLock.create({ data: { type: SYNC_TYPE_STUDENTS } });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }

      const existingLock = await this.prisma.syncLock.findUnique({
        where: { type: SYNC_TYPE_STUDENTS },
      });
      const isStale =
        existingLock &&
        Date.now() - existingLock.startedAt.getTime() > LOCK_STALE_MS;

      if (!isStale) {
        throw new SyncAlreadyRunningError();
      }

      this.logger.warn(
        `Найден зависший лок синхронизации (старше ${LOCK_STALE_MS / 60000} мин) — считаю его брошенным и перехватываю`,
      );
      await this.prisma.syncLock.deleteMany({
        where: { type: SYNC_TYPE_STUDENTS },
      });

      try {
        await this.prisma.syncLock.create({
          data: { type: SYNC_TYPE_STUDENTS },
        });
      } catch (raceError) {
        // Ещё один процесс мог перехватить зависший лок в этот же момент — тогда
        // это уже не наша синхронизация, а обычный "уже выполняется".
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
      where: { type: SYNC_TYPE_STUDENTS },
    });
  }
}
