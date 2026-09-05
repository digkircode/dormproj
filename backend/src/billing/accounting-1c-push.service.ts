import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ACCOUNTING_1C_PROVIDER,
  Accounting1cNotConfiguredError,
  type Accounting1cProvider,
} from '../accounting-1c/accounting-1c.types';
import { buildAccountingPaymentPush } from './build-accounting-payment-payload';
import { getErrorMessage } from '../sync/sync.errors';

const PAYMENT_WITH_RELATIONS = {
  contract: { include: { resident: true } },
  paymentIntent: { select: { payerFullName: true } },
  allocations: { include: { accrual: { select: { rentAmount: true, utilitiesAmount: true, periodStart: true } } } },
} as const;

// Флоу 1 (см. промпт проекта) — отправка платежей эквайринга в 1С Бухгалтерию. Раз в сутки
// (accounting-1c-push.scheduler.ts) пачкой все ещё не отправленные/упавшие, плюс ручной
// повтор одного платежа (billing.controller.ts#syncPaymentToAccounting1c) — оба пути через
// один и тот же метод, отличаются только набором payment.id на входе.
@Injectable()
export class Accounting1cPushService {
  private readonly logger = new Logger(Accounting1cPushService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ACCOUNTING_1C_PROVIDER) private readonly provider: Accounting1cProvider,
  ) {}

  // paymentIds не задан — пакетный ночной прогон (только NOT_SYNCED/FAILED); задан —
  // точечный повтор конкретных платежей (ручная кнопка), статус синка не фильтруем —
  // сотрудник явно попросил переотправить, независимо от текущего состояния.
  async pushPayments(paymentIds?: number[]): Promise<{ sent: number; succeeded: number; failed: number }> {
    if (!this.provider.isConfigured()) {
      this.logger.warn('1С Бухгалтерия не настроена — пропуск отправки платежей');
      return { sent: 0, succeeded: 0, failed: 0 };
    }

    const payments = await this.prisma.payment.findMany({
      where: {
        source: 'WEBSITE',
        reversedAt: null,
        ...(paymentIds ? { id: { in: paymentIds } } : { accounting1cSyncStatus: { in: ['NOT_SYNCED', 'FAILED'] } }),
      },
      include: PAYMENT_WITH_RELATIONS,
    });
    if (payments.length === 0) return { sent: 0, succeeded: 0, failed: 0 };

    const items = payments.map((p) => buildAccountingPaymentPush(p));

    let results: Awaited<ReturnType<Accounting1cProvider['pushPayments']>>;
    try {
      results = await this.provider.pushPayments(items);
    } catch (error) {
      if (error instanceof Accounting1cNotConfiguredError) return { sent: 0, succeeded: 0, failed: 0 };
      // Сеть/сервис недоступны целиком — статусы не трогаем, следующий прогон
      // (ночной крон или повторная ручная кнопка) попробует снова с чистого листа.
      this.logger.error(`Не удалось отправить платежи в 1С Бухгалтерию: ${getErrorMessage(error)}`);
      return { sent: payments.length, succeeded: 0, failed: 0 };
    }

    let succeeded = 0;
    let failed = 0;
    for (const result of results) {
      const payment = payments.find((p) => p.id === result.OplataID);
      if (!payment) continue;

      if (result.FinalStatus) {
        succeeded++;
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            accounting1cSyncStatus: 'SYNCED',
            // Фолбэк на уже сохранённый uid — 1С не обязана эхом возвращать DocumentUID на
            // КАЖДЫЙ успешный ответ (см. тот же приём во флоу 3, service-provision-doc.service.ts),
            // без него повторная успешная отправка тихо обнуляла бы уже известный uid.
            accounting1cDocumentUid: result.DocumentUID ?? payment.accounting1cDocumentUid ?? null,
            accounting1cSyncError: null,
            accounting1cSyncedAt: new Date(),
          },
        });
        // Запоминаем UID контрагента/договора только один раз (пока ещё не известны) —
        // не перезаписываем, если 1С вдруг вернула другое значение на повторной отправке.
        if (result.ContractorUID && !payment.contract.resident.accounting1cContractorUid) {
          await this.prisma.individual.update({
            where: { fizicheskoyeLitsoUid: payment.contract.residentIndividualUid },
            data: { accounting1cContractorUid: result.ContractorUID },
          });
        }
        if (result.ContractUID && !payment.contract.accounting1cUid) {
          await this.prisma.contract.update({
            where: { id: payment.contractId },
            data: { accounting1cUid: result.ContractUID },
          });
        }
      } else {
        failed++;
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            accounting1cSyncStatus: 'FAILED',
            accounting1cSyncError: result.ERROR ?? 'Неизвестная ошибка 1С',
            accounting1cSyncedAt: new Date(),
          },
        });
      }
    }

    this.logger.log(`Отправка платежей в 1С Бухгалтерию: отправлено ${payments.length}, успешно ${succeeded}, ошибок ${failed}`);
    return { sent: payments.length, succeeded, failed };
  }
}
