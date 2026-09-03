import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Accounting1cPushService } from './accounting-1c-push.service';

// Раз в сутки, не сразу при оплате (по прямой просьбе 2026-09-03) — 02:30 МСК, в том же
// окне, что и остальные ночные кроны (01:00 синк 1С, 01:30 статусы договоров, 02:00 пеня).
@Injectable()
export class Accounting1cPushScheduler {
  constructor(private readonly pushService: Accounting1cPushService) {}

  @Cron('30 2 * * *', { timeZone: 'Europe/Moscow' })
  async pushPayments(): Promise<void> {
    await this.pushService.pushPayments();
  }
}
