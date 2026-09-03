import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PaymentImportsIngestService } from './payment-imports-ingest.service';

// Раз в сутки, в том же окне, что и остальные ночные кроны (01:00 синк 1С, 01:30 статусы
// договоров, 02:00 пеня, 02:30 отправка платежей эквайринга в 1С) — 03:00 МСК.
@Injectable()
export class PaymentImportsIngestScheduler {
  constructor(private readonly ingestService: PaymentImportsIngestService) {}

  @Cron('0 3 * * *', { timeZone: 'Europe/Moscow' })
  async ingest(): Promise<void> {
    await this.ingestService.ingest();
  }
}
