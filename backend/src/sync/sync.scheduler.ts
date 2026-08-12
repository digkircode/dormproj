import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SyncService } from './sync.service';
import { getErrorMessage, SyncAlreadyRunningError } from './sync.errors';
import { MISSED_RUN_THRESHOLD_MS, SYNC_TYPE_STUDENTS } from './sync.constants';

@Injectable()
export class SyncScheduler {
  private readonly logger = new Logger(SyncScheduler.name);

  constructor(
    private readonly syncService: SyncService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron('0 1 * * *', { timeZone: 'Europe/Moscow' })
  async handleDailySync(): Promise<void> {
    await this.warnIfPreviousRunMissed();

    try {
      await this.syncService.runSync('CRON');
    } catch (error) {
      if (error instanceof SyncAlreadyRunningError) {
        this.logger.log(
          'Плановая синхронизация студентов пропущена: уже выполняется другая синхронизация (скорее всего, ручной запуск)',
        );
        return;
      }
      this.logger.error(
        `Плановая синхронизация студентов завершилась с ошибкой: ${getErrorMessage(error)}`,
      );
    }
  }

  private async warnIfPreviousRunMissed(): Promise<void> {
    const lastSuccess = await this.prisma.syncLog.findFirst({
      where: { type: SYNC_TYPE_STUDENTS, status: 'SUCCESS' },
      orderBy: { finishedAt: 'desc' },
    });

    const lastSuccessAt = lastSuccess?.finishedAt;
    if (
      !lastSuccessAt ||
      Date.now() - lastSuccessAt.getTime() > MISSED_RUN_THRESHOLD_MS
    ) {
      this.logger.warn(
        lastSuccessAt
          ? `Последняя успешная синхронизация студентов была ${lastSuccessAt.toISOString()} — дольше ожидаемых суток назад. Похоже, плановый запуск был пропущен.`
          : 'Успешных синхронизаций студентов ещё не было.',
      );
    }
  }
}
