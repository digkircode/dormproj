import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { IndividualsSyncService } from '../individuals-sync/individuals-sync.service';
import { CitizenshipSyncService } from '../citizenship-sync/citizenship-sync.service';
import { PassportSyncService } from '../passport-sync/passport-sync.service';
import { ContactInfoSyncService } from '../contact-info-sync/contact-info-sync.service';
import { SyncService } from './sync.service';
import { getErrorMessage, SyncAlreadyRunningError } from './sync.errors';
import { MISSED_RUN_THRESHOLD_MS, SYNC_TYPE_STUDENTS } from './sync.constants';

@Injectable()
export class SyncScheduler {
  private readonly logger = new Logger(SyncScheduler.name);

  constructor(
    private readonly syncService: SyncService,
    private readonly individualsSyncService: IndividualsSyncService,
    private readonly citizenshipSyncService: CitizenshipSyncService,
    private readonly passportSyncService: PassportSyncService,
    private readonly contactInfoSyncService: ContactInfoSyncService,
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
      } else {
        this.logger.error(
          `Плановая синхронизация студентов завершилась с ошибкой: ${getErrorMessage(error)}`,
        );
      }
    }

    // Физлица синхронизируются сразу следом на свежем списке UID из только что
    // обновлённой таблицы студентов — независимо от того, как прошёл шаг выше.
    try {
      await this.individualsSyncService.runSync('CRON');
    } catch (error) {
      if (error instanceof SyncAlreadyRunningError) {
        this.logger.log(
          'Плановая синхронизация физлиц пропущена: уже выполняется другая синхронизация (скорее всего, ручной запуск)',
        );
      } else {
        this.logger.error(
          `Плановая синхронизация физлиц завершилась с ошибкой: ${getErrorMessage(error)}`,
        );
      }
    }

    // Гражданство и паспортные данные используют свежий список UID из только что
    // обновлённой таблицы физлиц (individuals), не студентов напрямую. Друг от друга
    // они не зависят — порядок между ними не важен.
    try {
      await this.citizenshipSyncService.runSync('CRON');
    } catch (error) {
      if (error instanceof SyncAlreadyRunningError) {
        this.logger.log(
          'Плановая синхронизация гражданства пропущена: уже выполняется другая синхронизация (скорее всего, ручной запуск)',
        );
      } else {
        this.logger.error(
          `Плановая синхронизация гражданства завершилась с ошибкой: ${getErrorMessage(error)}`,
        );
      }
    }

    try {
      await this.passportSyncService.runSync('CRON');
    } catch (error) {
      if (error instanceof SyncAlreadyRunningError) {
        this.logger.log(
          'Плановая синхронизация паспортных данных пропущена: уже выполняется другая синхронизация (скорее всего, ручной запуск)',
        );
      } else {
        this.logger.error(
          `Плановая синхронизация паспортных данных завершилась с ошибкой: ${getErrorMessage(error)}`,
        );
      }
    }

    try {
      await this.contactInfoSyncService.runSync('CRON');
    } catch (error) {
      if (error instanceof SyncAlreadyRunningError) {
        this.logger.log(
          'Плановая синхронизация контактной информации пропущена: уже выполняется другая синхронизация (скорее всего, ручной запуск)',
        );
        return;
      }
      this.logger.error(
        `Плановая синхронизация контактной информации завершилась с ошибкой: ${getErrorMessage(error)}`,
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
