import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PaymentImportsIngestService } from './payment-imports-ingest.service';
import { PrismaService } from '../prisma/prisma.service';
import { logScheduledSync } from '../sync/scheduled-sync-log';
import { isAccountingAutoRunEnabled } from '../sync/accounting-auto-run';

export const ACCOUNTING_PAYMENT_IMPORT_SYNC_TYPE = 'accounting-payment-import';

@Injectable()
export class PaymentImportsIngestScheduler {
  private readonly logger = new Logger(PaymentImportsIngestScheduler.name);
  constructor(private readonly ingestService: PaymentImportsIngestService, private readonly prisma: PrismaService) {}

  @Cron('0 3 * * *', { name: 'sync-accounting-payment-import', timeZone: 'Europe/Moscow' })
  async ingest(): Promise<void> {
    try {
      if (!await isAccountingAutoRunEnabled(this.prisma, ACCOUNTING_PAYMENT_IMPORT_SYNC_TYPE)) return;
    } catch (error) {
      this.logger.error(`Не удалось проверить автозапуск загрузки платежей: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    await logScheduledSync(this.prisma, this.logger, ACCOUNTING_PAYMENT_IMPORT_SYNC_TYPE, async () => {
      const { errorMessage, ...details } = await this.ingestService.ingest();
      return { details, errorMessage };
    });
  }
}
