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
import { listSyncLogs, syncLogFacetValues, type SyncLogsListQuery } from './sync-logs-list';

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

      // Полная очистка + перезапись вместо построчного upsert/diff — источник всегда
      // отдаёт полный список активных студентов, поэтому промежуточное состояние
      // (кто добавился/обновился) не нужно, а bulk-запись быстрее N апсертов.
      // Guard от аномального падения количества остаётся: если пришло заметно меньше,
      // чем сейчас в базе, это больше похоже на сбой источника, чем на массовое
      // отчисление — прерываем транзакцию без удаления данных.
      const { added, removed } = await this.prisma.$transaction(
        async (tx) => {
          const existingCount = await tx.student.count();

          if (
            existingCount > 0 &&
            records.length < existingCount * MIN_SURVIVAL_RATIO
          ) {
            throw new SyncGuardTrippedError(
              `Во внешнем API пришло ${records.length} записей, а сейчас в базе ${existingCount} студентов — это меньше ${Math.round(MIN_SURVIVAL_RATIO * 100)}% от текущего количества. Похоже на сбой источника, синхронизация остановлена без удаления данных.`,
            );
          }

          await tx.student.deleteMany({});

          if (records.length > 0) {
            await tx.student.createMany({
              data: records.map((record) => ({
                zachetnayaKnigaUid: record.ZachetnayaKnigaUID,
                ...toStudentData(record),
              })),
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
        `Синхронизация студентов завершена: очищено ${removed}, записано ${added}`,
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

  // Точечная синхронизация одного физлица (кнопка на карточке) — без guard'а от
  // падения количества (тот защищает полный слепок; здесь 0 записей у человека,
  // переставшего быть активным студентом, — легитимный исход, а не сбой источника).
  // Отдельного SyncLog не пишет — это шаг общего лога, который ведёт IndividualSyncService.
  async syncOne(uid: string): Promise<{ fetchedCount: number; added: number; removed: number }> {
    const records = await this.externalApi.fetchActiveStudentsByUid(uid);

    return this.prisma.$transaction(
      async (tx) => {
        const existingCount = await tx.student.count({ where: { fizicheskoyeLitsoUid: uid } });
        await tx.student.deleteMany({ where: { fizicheskoyeLitsoUid: uid } });

        if (records.length > 0) {
          await tx.student.createMany({
            data: records.map((record) => ({
              zachetnayaKnigaUid: record.ZachetnayaKnigaUID,
              ...toStudentData(record),
            })),
          });
        }

        return { fetchedCount: records.length, added: records.length, removed: existingCount };
      },
      { timeout: TRANSACTION_TIMEOUT_MS },
    );
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

  async listLogs(query: SyncLogsListQuery) {
    return listSyncLogs(this.prisma, SYNC_TYPE_STUDENTS, query);
  }

  async logFacetValues(field: string) {
    return syncLogFacetValues(this.prisma, SYNC_TYPE_STUDENTS, field);
  }
}
