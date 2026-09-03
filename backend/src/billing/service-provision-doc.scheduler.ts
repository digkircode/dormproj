import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ServiceProvisionDocService } from './service-provision-doc.service';

// 1 число месяца, 03:00 МСК — после остального ночного окна (01:00 синк 1С, 01:30 статусы
// договоров, 02:00 пеня, 02:30 отправка платежей в 1С). Не 30/31 числа предыдущего месяца
// (последний день месяца плавающий, усложнял бы cron) — на 1 число месяц уже гарантированно
// закончился целиком, и по прямой просьбе 2026-09-04 документ собирается именно за него,
// не за наступающий.
@Injectable()
export class ServiceProvisionDocScheduler {
  constructor(private readonly service: ServiceProvisionDocService) {}

  @Cron('0 3 1 * *', { timeZone: 'Europe/Moscow' })
  async run(): Promise<void> {
    await this.service.run();
  }
}
