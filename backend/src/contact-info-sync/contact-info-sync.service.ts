import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { getErrorMessage, sanitizeErrorStack, SyncAlreadyRunningError } from '../sync/sync.errors';
import type { SyncTriggerType } from '../sync/sync.service';
import { ExternalContactInfoApiService } from './external-contact-info-api.service';
import { toContactInfoData } from './contact-info.mapper';
import {
  CONTACT_INFO_CHUNK_SIZE,
  CONTACT_INFO_TRANSACTION_TIMEOUT_MS,
  LOCK_STALE_MS,
  SYNC_TYPE_CONTACT_INFO,
} from './contact-info-sync.constants';
import { listSyncLogs, syncLogFacetValues, type SyncLogsListQuery } from '../sync/sync-logs-list';

export interface ContactInfoSyncResult {
  status: 'SUCCESS';
  fetchedCount: number;
  added: number;
  updated: number;
  removed: number;
  startedAt: Date;
  finishedAt: Date;
}

@Injectable()
export class ContactInfoSyncService {
  private readonly logger = new Logger(ContactInfoSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly externalApi: ExternalContactInfoApiService,
  ) {}

  async runSync(trigger: SyncTriggerType): Promise<ContactInfoSyncResult> {
    await this.acquireLock();

    const log = await this.prisma.syncLog.create({
      data: { type: SYNC_TYPE_CONTACT_INFO, trigger, status: 'RUNNING' },
    });

    try {
      const individuals = await this.prisma.individual.findMany({
        where: { isManual: false },
        select: { fizicheskoyeLitsoUid: true },
      });
      const uids = individuals.map((i) => i.fizicheskoyeLitsoUid);

      let fetchedCount = 0;
      let added = 0;
      let removed = 0;

      for (let i = 0; i < uids.length; i += CONTACT_INFO_CHUNK_SIZE) {
        const batch = uids.slice(i, i + CONTACT_INFO_CHUNK_SIZE);
        const records = await this.externalApi.fetchContactInfo(batch);

        const { added: batchAdded, removed: batchRemoved } = await this.prisma.$transaction(
          async (tx) => {
            const scope = { fizicheskoyeLitsoUid: { in: batch }, preservedFromMerge: false } as const;
            const existingCount = await tx.contactInfo.count({ where: scope });

            await tx.contactInfo.deleteMany({ where: scope });

            if (records.length > 0) {
              await tx.contactInfo.createMany({
                data: records.map((record) => toContactInfoData(record)),
              });
            }

            return { added: records.length, removed: existingCount };
          },
          { timeout: CONTACT_INFO_TRANSACTION_TIMEOUT_MS },
        );

        fetchedCount += records.length;
        added += batchAdded;
        removed += batchRemoved;
      }

      const finishedAt = new Date();
      await this.prisma.syncLog.update({
        where: { id: log.id },
        data: {
          status: 'SUCCESS',
          finishedAt,
          fetchedCount,
          added,
          updated: 0,
          removed,
        },
      });

      this.logger.log(
        `Синхронизация контактной информации завершена: запрошено ${uids.length} UID, очищено ${removed}, записано ${added}`,
      );

      return {
        status: 'SUCCESS',
        fetchedCount,
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

  async syncOne(uid: string): Promise<{ fetchedCount: number; added: number; removed: number; records: unknown[] }> {
    const records = await this.externalApi.fetchContactInfo([uid]);

    return this.prisma.$transaction(
      async (tx) => {
        const scope = { fizicheskoyeLitsoUid: uid, preservedFromMerge: false } as const;
        const existingCount = await tx.contactInfo.count({ where: scope });
        await tx.contactInfo.deleteMany({ where: scope });

        if (records.length > 0) {
          await tx.contactInfo.createMany({ data: records.map((record) => toContactInfoData(record)) });
        }

        return { fetchedCount: records.length, added: records.length, removed: existingCount, records };
      },
      { timeout: CONTACT_INFO_TRANSACTION_TIMEOUT_MS },
    );
  }

  private async acquireLock(): Promise<void> {
    try {
      await this.prisma.syncLock.create({
        data: { type: SYNC_TYPE_CONTACT_INFO },
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }

      const existingLock = await this.prisma.syncLock.findUnique({
        where: { type: SYNC_TYPE_CONTACT_INFO },
      });
      const isStale =
        existingLock &&
        Date.now() - existingLock.startedAt.getTime() > LOCK_STALE_MS;

      if (!isStale) {
        throw new SyncAlreadyRunningError();
      }

      this.logger.warn(
        `Найден зависший лок синхронизации контактной информации (старше ${LOCK_STALE_MS / 60000} мин) - считаю его брошенным и перехватываю`,
      );
      await this.prisma.syncLock.deleteMany({
        where: { type: SYNC_TYPE_CONTACT_INFO },
      });

      try {
        await this.prisma.syncLock.create({
          data: { type: SYNC_TYPE_CONTACT_INFO },
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
      where: { type: SYNC_TYPE_CONTACT_INFO },
    });
  }

  async listLogs(query: SyncLogsListQuery) {
    return listSyncLogs(this.prisma, SYNC_TYPE_CONTACT_INFO, query);
  }

  async logFacetValues(field: string) {
    return syncLogFacetValues(this.prisma, SYNC_TYPE_CONTACT_INFO, field);
  }
}
