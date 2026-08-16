import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { getErrorMessage, SyncAlreadyRunningError } from '../sync/sync.errors';
import { SyncService } from '../sync/sync.service';
import { IndividualsSyncService } from '../individuals-sync/individuals-sync.service';
import { CitizenshipSyncService } from '../citizenship-sync/citizenship-sync.service';
import { PassportSyncService } from '../passport-sync/passport-sync.service';
import { ContactInfoSyncService } from '../contact-info-sync/contact-info-sync.service';
import { LOCK_STALE_MS, SYNC_TYPE_INDIVIDUAL } from './individual-sync.constants';
import { listSyncLogs, syncLogFacetValues, type SyncLogsListQuery } from '../sync/sync-logs-list';

export interface IndividualSyncResult {
  status: 'SUCCESS';
  fetchedCount: number;
  added: number;
  updated: number;
  removed: number;
  startedAt: Date;
  finishedAt: Date;
}

// Синхронизация одного физлица со своей карточки — проходит те же 5 источников, что
// и ночной крон (студент → физлицо → гражданство → паспорт → контакты), но по одному
// UID и как ОДИН лог, а не пять. Никакого cron/массового запуска для этого типа нет —
// единственный вход сюда — POST /individuals/:uid/sync (см. IndividualsController).
@Injectable()
export class IndividualSyncService {
  private readonly logger = new Logger(IndividualSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly syncService: SyncService,
    private readonly individualsSyncService: IndividualsSyncService,
    private readonly citizenshipSyncService: CitizenshipSyncService,
    private readonly passportSyncService: PassportSyncService,
    private readonly contactInfoSyncService: ContactInfoSyncService,
  ) {}

  async runSyncForIndividual(uid: string): Promise<IndividualSyncResult> {
    await this.acquireLock();

    const log = await this.prisma.syncLog.create({
      data: { type: SYNC_TYPE_INDIVIDUAL, trigger: 'MANUAL', status: 'RUNNING', targetUid: uid },
    });

    try {
      const students = await this.syncService.syncOne(uid);
      const individuals = await this.individualsSyncService.syncOne(uid);
      const citizenship = await this.citizenshipSyncService.syncOne(uid);
      const passport = await this.passportSyncService.syncOne(uid);
      const contactInfo = await this.contactInfoSyncService.syncOne(uid);

      const fetchedCount =
        students.fetchedCount + individuals.fetchedCount + citizenship.fetchedCount + passport.fetchedCount + contactInfo.fetchedCount;
      const added = students.added + individuals.added + citizenship.added + passport.added + contactInfo.added;
      // "Обновлено" осмысленно только у физлица (upsert) — у остальных 4 шагов слепок
      // (удалить+записать), там любое совпадение считается через added/removed.
      const updated = individuals.updated;
      const removed = students.removed + citizenship.removed + passport.removed + contactInfo.removed;

      const finishedAt = new Date();
      await this.prisma.syncLog.update({
        where: { id: log.id },
        data: { status: 'SUCCESS', finishedAt, fetchedCount, added, updated, removed },
      });

      this.logger.log(`Синхронизация физлица ${uid} завершена: получено ${fetchedCount}, записано ${added}, обновлено ${updated}`);

      return { status: 'SUCCESS', fetchedCount, added, updated, removed, startedAt: log.startedAt, finishedAt };
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
      await this.prisma.syncLock.create({ data: { type: SYNC_TYPE_INDIVIDUAL } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }

      const existingLock = await this.prisma.syncLock.findUnique({ where: { type: SYNC_TYPE_INDIVIDUAL } });
      const isStale = existingLock && Date.now() - existingLock.startedAt.getTime() > LOCK_STALE_MS;

      if (!isStale) {
        throw new SyncAlreadyRunningError();
      }

      this.logger.warn(`Найден зависший лок синхронизации физлица (старше ${LOCK_STALE_MS / 60000} мин) — считаю его брошенным и перехватываю`);
      await this.prisma.syncLock.deleteMany({ where: { type: SYNC_TYPE_INDIVIDUAL } });

      try {
        await this.prisma.syncLock.create({ data: { type: SYNC_TYPE_INDIVIDUAL } });
      } catch (raceError) {
        if (raceError instanceof Prisma.PrismaClientKnownRequestError && raceError.code === 'P2002') {
          throw new SyncAlreadyRunningError();
        }
        throw raceError;
      }
    }
  }

  private async releaseLock(): Promise<void> {
    await this.prisma.syncLock.deleteMany({ where: { type: SYNC_TYPE_INDIVIDUAL } });
  }

  async listLogs(query: SyncLogsListQuery) {
    return listSyncLogs(this.prisma, SYNC_TYPE_INDIVIDUAL, query);
  }

  async logFacetValues(field: string) {
    return syncLogFacetValues(this.prisma, SYNC_TYPE_INDIVIDUAL, field);
  }
}
