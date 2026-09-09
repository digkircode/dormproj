import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceProvisionDocService, SERVICE_PROVISION_SYNC_TYPE } from './service-provision-doc.service';

const MOSCOW_TIME_ZONE = 'Europe/Moscow';

function moscowCalendarDate(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MOSCOW_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return new Date(Date.UTC(value('year'), value('month') - 1, value('day')));
}

function isLastCalendarDay(date: Date): boolean {
  const tomorrow = new Date(date);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return tomorrow.getUTCMonth() !== date.getUTCMonth();
}

function isAfterFinalSendTime(now: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MOSCOW_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  return hour > 23 || (hour === 23 && minute >= 55);
}

// Текущий месяц создаётся при старте приложения и пересчитывается каждый день в 03:00
// МСК. В 23:55 последнего календарного дня выполняется ещё один пересчёт и сразу после
// него отправляются только два документа текущего месяца.
@Injectable()
export class ServiceProvisionDocScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(ServiceProvisionDocScheduler.name);

  constructor(
    private readonly service: ServiceProvisionDocService,
    private readonly prisma: PrismaService,
  ) {}

  private async runLogged(operation: string, task: () => Promise<Record<string, unknown>>): Promise<void> {
    let log: { id: number };
    try {
      log = await this.prisma.syncLog.create({
        data: { type: SERVICE_PROVISION_SYNC_TYPE, trigger: 'CRON', status: 'RUNNING', details: { operation } },
        select: { id: true },
      });
    } catch (error) {
      this.logger.error(`Не удалось создать лог автоматической операции (${operation}): ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    try {
      const details = await task();
      await this.prisma.syncLog.update({
        where: { id: log.id },
        data: { status: 'SUCCESS', finishedAt: new Date(), details: { operation, ...details } },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.syncLog.update({
        where: { id: log.id },
        data: { status: 'FAILED', finishedAt: new Date(), errorMessage: message, details: { operation } },
      }).catch(() => undefined);
      this.logger.error(`Ошибка автоматической операции оказания услуг (${operation}): ${message}`);
    }
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.runLogged('STARTUP_RECOVERY', async () => {
      const now = new Date();
      const currentMonth = moscowCalendarDate(now);
      await this.service.computeAndSave(currentMonth);

      // Если приложение перезапустилось уже после конца предыдущего месяца, закрываем
      // пропущенную отправку. Отправляются только документы, которые ещё не SYNCED.
      const previousMonth = new Date(Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth() - 1, 1));
      await this.service.computeAndSave(previousMonth);
      await this.service.retryUnsyncedMonth(previousMonth);

      // Если сервер поднялся после 23:55 в последний день, cron уже прошёл — выполняем
      // тот же финальный прогон сразу при старте.
      if (isLastCalendarDay(currentMonth) && isAfterFinalSendTime(now)) {
        const result = await this.service.run(currentMonth);
        return { period: currentMonth.toISOString().slice(0, 7), ...result };
      }
      return { period: previousMonth.toISOString().slice(0, 7), recovery: 'checked' };
    });
  }

  @Cron('0 0 1 * *', { timeZone: MOSCOW_TIME_ZONE })
  async createCurrentMonth(): Promise<void> {
    await this.runLogged('CREATE_CURRENT_MONTH', async () => ({
      period: moscowCalendarDate(new Date()).toISOString().slice(0, 7),
      ...(await this.service.computeAndSave(moscowCalendarDate(new Date()))),
    }));
  }

  @Cron('0 3 * * *', { timeZone: MOSCOW_TIME_ZONE })
  async recalculateCurrentMonth(): Promise<void> {
    await this.runLogged('DAILY_RECALCULATION', async () => ({
      period: moscowCalendarDate(new Date()).toISOString().slice(0, 7),
      ...(await this.service.computeAndSave(moscowCalendarDate(new Date()))),
    }));
  }

  @Cron('55 23 * * *', { timeZone: MOSCOW_TIME_ZONE })
  async finalizeCurrentMonth(): Promise<void> {
    const today = moscowCalendarDate(new Date());
    if (isLastCalendarDay(today)) {
      await this.runLogged('FINAL_RECALC_AND_SEND', async () => ({ period: today.toISOString().slice(0, 7), ...(await this.service.run(today)) }));
      return;
    }

    // Ежедневно повторяем пропущенную отправку прошлого месяца, если предыдущий
    // финальный запуск не состоялся из-за перезапуска или временной ошибки 1С.
    const previousMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    await this.runLogged('RETRY_PREVIOUS_MONTH', async () => ({ period: previousMonth.toISOString().slice(0, 7), ...(await this.service.retryUnsyncedMonth(previousMonth)) }));
  }
}
