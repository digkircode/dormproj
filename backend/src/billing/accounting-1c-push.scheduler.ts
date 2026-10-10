import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Accounting1cPushService } from './accounting-1c-push.service';
import { PrismaService } from '../prisma/prisma.service';
import { ACCOUNTING_1C_PROVIDER, type Accounting1cProvider } from '../accounting-1c/accounting-1c.types';
import { logScheduledSync } from '../sync/scheduled-sync-log';

export const ACCOUNTING_PAYMENT_PUSH_SYNC_TYPE = 'accounting-payment-push';

// Раз в сутки, не сразу при оплате (по прямой просьбе 2026-09-03) — 02:30 МСК, в том же
// окне, что и остальные ночные кроны (01:00 синк 1С, 01:30 статусы договоров, 02:00 пеня).
@Injectable()
export class Accounting1cPushScheduler {
  private readonly logger = new Logger(Accounting1cPushScheduler.name);
  constructor(
    private readonly pushService: Accounting1cPushService,
    private readonly prisma: PrismaService,
    @Inject(ACCOUNTING_1C_PROVIDER) private readonly provider: Accounting1cProvider,
  ) {}

  @Cron('30 2 * * *', { timeZone: 'Europe/Moscow' })
  async pushPayments(): Promise<void> {
    await logScheduledSync(this.prisma, this.logger, ACCOUNTING_PAYMENT_PUSH_SYNC_TYPE, async () => {
      if (!this.provider.isConfigured()) return { details: {}, errorMessage: 'Отправка платежей в 1С Бухгалтерию не настроена' };
      const result = await this.pushService.pushPayments();
      const unmatched = result.sent - result.succeeded - result.failed;
      return {
        details: result,
        errorMessage: result.failed > 0 || unmatched > 0
          ? `Ошибки отправки: ${result.failed}; без ответа 1С: ${unmatched}`
          : undefined,
      };
    });
  }
}
