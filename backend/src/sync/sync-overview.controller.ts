import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ACCOUNTING_1C_PROVIDER, type Accounting1cProvider } from '../accounting-1c/accounting-1c.types';
import { listSyncLogs, syncLogFacetValues, type SyncLogsListQuery } from './sync-logs-list';
import { dailyScheduleWindow, nextMonthStartMoscow, SYNC_JOBS, syncJobWhere } from './sync-overview.jobs';
import { PortalUsersSyncService } from './portal-users-sync.service';
import { ACCOUNTING_AUTO_RUN_JOBS } from './accounting-auto-run';

const overviewLogSelect = {
  status: true,
  startedAt: true,
  finishedAt: true,
  fetchedCount: true,
  added: true,
  updated: true,
  removed: true,
  errorMessage: true,
  details: true,
} as const;

@Controller('sync/overview')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
export class SyncOverviewController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ACCOUNTING_1C_PROVIDER) private readonly accounting: Accounting1cProvider,
    private readonly portalUsers: PortalUsersSyncService,
  ) {}

  private job(id: string) {
    const job = SYNC_JOBS.find((item) => item.id === id);
    if (!job) throw new NotFoundException();
    return job;
  }

  @Get()
  async overview() {
    const now = new Date();
    const settings = await this.prisma.syncJobSetting.findMany({ select: { jobId: true, enabled: true, updatedAt: true } });
    const settingsById = new Map(settings.map((setting) => [setting.jobId, setting]));
    return Promise.all(SYNC_JOBS.map(async (job) => {
      const setting = settingsById.get(job.id);
      const autoRunEnabled = job.group === 'ACCOUNTING' ? setting?.enabled ?? true : null;
      const where = syncJobWhere(job);
      const [lastRun, lastSuccess, lastCron] = await Promise.all([
        this.prisma.syncLog.findFirst({ where, orderBy: { startedAt: 'desc' }, select: overviewLogSelect }),
        this.prisma.syncLog.findFirst({ where: { AND: [where, { status: 'SUCCESS' }] }, orderBy: { finishedAt: 'desc' }, select: { finishedAt: true } }),
        job.schedule.kind === 'MANUAL' || job.schedule.kind === 'STARTUP' ? Promise.resolve(null) : this.prisma.syncLog.findFirst({ where: { AND: [where, { trigger: 'CRON' }] }, orderBy: { startedAt: 'desc' }, select: { startedAt: true } }),
      ]);
      const configured = job.configuration === 'PUSH' ? this.accounting.isConfigured()
        : job.configuration === 'FETCH' ? this.accounting.isFetchConfigured()
          : job.configuration === 'DOCUMENTS' ? this.accounting.isServiceProvisionConfigured()
            : job.configuration === 'PORTAL' ? this.portalUsers.isConfigured() : true;
      const window = job.schedule.kind === 'MANUAL' || job.schedule.kind === 'STARTUP' ? null : dailyScheduleWindow(now, job.schedule.hour, job.schedule.minute);
      const nextScheduledAt = autoRunEnabled === false ? null : job.id === 'service-provision-preparation' && window
        ? new Date(Math.min(window.next.getTime(), nextMonthStartMoscow(now).getTime()))
        : window?.next ?? null;
      const missed = window && lastCron && lastCron.startedAt < window.previous
        && (!setting || setting.updatedAt < window.previous)
        && now.getTime() > window.previous.getTime() + 2 * 60 * 60_000;
      const state = lastRun?.status === 'RUNNING' ? 'RUNNING' : autoRunEnabled === false ? 'DISABLED'
        : !configured ? 'NOT_CONFIGURED'
          : lastRun?.status === 'FAILED' ? 'FAILED'
            : missed ? 'MISSED' : lastRun?.status ?? 'NONE';
      return {
        id: job.id,
        group: job.group,
        state,
        configured,
        autoRunEnabled,
        schedule: job.schedule,
        nextScheduledAt: nextScheduledAt?.toISOString() ?? null,
        lastRun,
        lastSuccessAt: lastSuccess?.finishedAt ?? null,
        manualPath: job.manualPath ?? null,
      };
    }));
  }

  @Patch('jobs/:id/auto-run')
  async setAutoRun(@Param('id') id: string, @Body() body: unknown) {
    const job = this.job(id);
    if (job.group !== 'ACCOUNTING' || !ACCOUNTING_AUTO_RUN_JOBS.some((item) => item === id)) {
      throw new BadRequestException('Автозапуск доступен только для заданий 1С Бухгалтерии');
    }
    const parsed = z.object({ enabled: z.boolean() }).safeParse(body);
    if (!parsed.success) throw new BadRequestException('Укажите enabled: true или false');
    return this.prisma.syncJobSetting.upsert({
      where: { jobId: id },
      create: { jobId: id, enabled: parsed.data.enabled },
      update: { enabled: parsed.data.enabled },
      select: { jobId: true, enabled: true },
    });
  }

  @Get('jobs/:id/logs')
  logs(@Param('id') id: string, @Query() query: SyncLogsListQuery) {
    const job = this.job(id);
    return listSyncLogs(this.prisma, job.type, query, syncJobWhere(job));
  }

  @Get('jobs/:id/logs/facets/:field')
  facets(@Param('id') id: string, @Param('field') field: string) {
    const job = this.job(id);
    return syncLogFacetValues(this.prisma, job.type, field, syncJobWhere(job));
  }
}
