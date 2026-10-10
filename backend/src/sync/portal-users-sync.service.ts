import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { getErrorMessage, sanitizeErrorStack, SyncAlreadyRunningError } from './sync.errors';
import { listSyncLogs, syncLogFacetValues, type SyncLogsListQuery } from './sync-logs-list';
import { PortalUsersApiService, type PortalUserRecord } from './portal-users-api.service';
import type { SyncTriggerType } from './sync.service';

const TYPE = 'portal-users';
const LOCK_STALE_MS = 30 * 60 * 1_000;

export interface PortalUsersSyncResult {
  status: 'SUCCESS';
  fetchedCount: number;
  added: number;
  updated: number;
  skipped: number;
  skippedReasons: Record<string, number>;
}

@Injectable()
export class PortalUsersSyncService {
  private readonly logger = new Logger(PortalUsersSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly api: PortalUsersApiService,
  ) {}

  isConfigured(): boolean { return this.api.isConfigured(); }

  private async acquireLock(): Promise<void> {
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
  }

  async runSync(trigger: SyncTriggerType): Promise<PortalUsersSyncResult> {
    await this.acquireLock();
    return this.runWithLock(trigger);
  }

  // Полный запрос портала занимает несколько минут. Ручной запуск отвечает сразу,
  // а ход и результат остаются видны в SyncLog.
  async startManual(): Promise<{ status: 'RUNNING' }> {
    await this.acquireLock();
    void this.runWithLock('MANUAL').catch((error: unknown) => {
      this.logger.error(`Ручная синхронизация пользователей портала завершилась с ошибкой: ${getErrorMessage(error)}`);
    });
    return { status: 'RUNNING' };
  }

  private async runWithLock(trigger: SyncTriggerType): Promise<PortalUsersSyncResult> {
    try {
      const log = await this.prisma.syncLog.create({ data: { type: TYPE, trigger, status: 'RUNNING' } });
      try {
        if (!this.api.isConfigured()) throw new Error('Доступ к API портала не настроен');
        const individuals = await this.prisma.individual.findMany({ select: { fizicheskoyeLitsoUid: true } });
        if (individuals.length === 0) throw new Error('Сначала загрузите физических лиц из 1С');
        const availableUids = new Set(individuals.map((item) => item.fizicheskoyeLitsoUid));
        const portalUsers = await this.api.fetchAll();
        const uidCounts = new Map<string, number>();
        const azureCounts = new Map<string, number>();
        for (const user of portalUsers) {
          if (user.univerId) uidCounts.set(user.univerId, (uidCounts.get(user.univerId) ?? 0) + 1);
          if (user.azureId) azureCounts.set(user.azureId, (azureCounts.get(user.azureId) ?? 0) + 1);
        }
        const localUsers = await this.prisma.user.findMany({
          select: { id: true, azureId: true, univerId: true, linkSource: true },
        });
        const byId = new Map(localUsers.map((user) => [user.id, user]));
        const claimedUid = new Map(localUsers.filter((user) => user.univerId).map((user) => [user.univerId!, user.id]));
        const claimedAzure = new Map(localUsers.filter((user) => user.azureId).map((user) => [user.azureId!, user.id]));
        const localAzureCounts = new Map<string, number>();
        for (const user of localUsers) {
          if (user.azureId) localAzureCounts.set(user.azureId, (localAzureCounts.get(user.azureId) ?? 0) + 1);
        }
        const reasons: Record<string, number> = {
          noUniversityLink: 0, individualNotFound: 0, duplicateUniversityLink: 0,
          duplicateAzureLink: 0, claimedByAnotherUser: 0, azureClaimedByAnotherUser: 0, manuallyManaged: 0,
          legacyLink: 0, unchanged: 0, writeConflict: 0,
        };
        const create: PortalUserRecord[] = [];
        const update: PortalUserRecord[] = [];
        for (const user of portalUsers) {
          const uid = user.univerId;
          if (!uid) { reasons.noUniversityLink++; continue; }
          if (!availableUids.has(uid)) { reasons.individualNotFound++; continue; }
          if ((uidCounts.get(uid) ?? 0) !== 1) { reasons.duplicateUniversityLink++; continue; }
          if (user.azureId && (azureCounts.get(user.azureId) ?? 0) !== 1) { reasons.duplicateAzureLink++; continue; }
          if (user.azureId && (localAzureCounts.get(user.azureId) ?? 0) > 1) { reasons.duplicateAzureLink++; continue; }
          const claimant = claimedUid.get(uid);
          if (claimant !== undefined && claimant !== user.id) { reasons.claimedByAnotherUser++; continue; }
          const azureClaimant = user.azureId ? claimedAzure.get(user.azureId) : undefined;
          if (azureClaimant !== undefined && azureClaimant !== user.id) { reasons.azureClaimedByAnotherUser++; continue; }
          const existing = byId.get(user.id);
          if (!existing) {
            create.push(user);
            claimedUid.set(uid, user.id);
            if (user.azureId) claimedAzure.set(user.azureId, user.id);
            continue;
          }
          if (existing.linkSource === 'MANUAL') { reasons.manuallyManaged++; continue; }
          if (existing.linkSource !== 'PORTAL' && (existing.univerId || existing.azureId)) { reasons.legacyLink++; continue; }
          if (existing.univerId === uid && existing.azureId === user.azureId && existing.linkSource === 'PORTAL') {
            reasons.unchanged++; continue;
          }
          update.push(user);
        }

        let added = 0;
        let updated = 0;
        for (let index = 0; index < create.length; index += 500) {
          const batch = create.slice(index, index + 500);
          const result = await this.prisma.user.createMany({
            data: batch.map((user) => ({
              id: user.id, fullName: user.fullName, email: user.email,
              azureId: user.azureId, univerId: user.univerId, linkSource: 'PORTAL',
            })),
            skipDuplicates: true,
          });
          added += result.count;
          reasons.writeConflict += batch.length - result.count;
        }
        for (const user of update) {
          try {
            const result = await this.prisma.user.updateMany({
              where: { id: user.id, OR: [
                { linkSource: 'PORTAL' },
                { linkSource: 'UNSET', azureId: null, univerId: null },
              ] },
              data: { azureId: user.azureId, univerId: user.univerId, linkSource: 'PORTAL' },
            });
            updated += result.count;
            reasons.writeConflict += 1 - result.count;
          } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2002' || error.code === 'P2003')) {
              reasons.writeConflict++;
              continue;
            }
            throw error;
          }
        }
        const skipped = Object.values(reasons).reduce((sum, count) => sum + count, 0);
        await this.prisma.syncLog.update({
          where: { id: log.id },
          data: {
            status: 'SUCCESS', finishedAt: new Date(), fetchedCount: portalUsers.length,
            added, updated, removed: 0,
            details: { skipped, skippedReasons: reasons } as Prisma.InputJsonValue,
          },
        });
        this.logger.log(`Портал: получено ${portalUsers.length}, добавлено ${added}, обновлено ${updated}, пропущено ${skipped}`);
        return { status: 'SUCCESS', fetchedCount: portalUsers.length, added, updated, skipped, skippedReasons: reasons };
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

  listLogs(query: SyncLogsListQuery) { return listSyncLogs(this.prisma, TYPE, query); }
  logFacetValues(field: string) { return syncLogFacetValues(this.prisma, TYPE, field); }
}
