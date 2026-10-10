import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PaymentImportsIngestService } from './payment-imports-ingest.service';
import { PrismaService } from '../prisma/prisma.service';
import { logScheduledSync } from '../sync/scheduled-sync-log';

export const ACCOUNTING_PAYMENT_IMPORT_SYNC_TYPE = 'accounting-payment-import';

// Раз в сутки, в том же окне, что и остальные ночные кроны (01:00 синк 1С, 01:30 статусы
// договоров, 02:00 пеня, 02:30 отправка платежей эквайринга в 1С) — 03:00 МСК.
@Injectable()
export class PaymentImportsIngestScheduler {
  private readonly logger = new Logger(PaymentImportsIngestScheduler.name);
  constructor(private readonly ingestService: PaymentImportsIngestService, private readonly prisma: PrismaService) {}

  @Cron('0 3 * * *', { timeZone: 'Europe/Moscow' })
  async ingest(): Promise<void> {
    await logScheduledSync(this.prisma, this.logger, ACCOUNTING_PAYMENT_IMPORT_SYNC_TYPE, async () => {
      const { errorMessage, ...details } = await this.ingestService.ingest();
      return { details, errorMessage };
    });
  }
}
