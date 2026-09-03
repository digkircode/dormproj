import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import type { Env } from '../config/env.schema';
import {
  Accounting1cNotConfiguredError,
  type Accounting1cProvider,
  type AccountingPaymentPush,
  type AccountingPaymentPushResult,
  type AccountingRawImportedPayment,
} from './accounting-1c.types';

const REQUEST_TIMEOUT_MS = 30_000;

// Basic Auth — тот же приём, что и у остальных интеграций с 1С в проекте (см.
// sync/external-student-api.service.ts). Два метода — отправка платежей эквайринга
// (флоу 1) и получение платежей мимо сайта (флоу 2), независимо настраиваемые (может
// быть включён только один из URL). Флоу 3 — отдельный провайдер, когда до него дойдёт очередь.
@Injectable()
export class Accounting1cPaymentsProvider implements Accounting1cProvider {
  private readonly logger = new Logger(Accounting1cPaymentsProvider.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get('ACCOUNTING_1C_LOGIN', { infer: true }) &&
        this.config.get('ACCOUNTING_1C_PASSWORD', { infer: true }) &&
        this.config.get('ACCOUNTING_1C_SEND_PAYMENTS_URL', { infer: true }),
    );
  }

  async pushPayments(items: AccountingPaymentPush[]): Promise<AccountingPaymentPushResult[]> {
    if (!this.isConfigured()) throw new Accounting1cNotConfiguredError();
    if (items.length === 0) return [];

    const response = await firstValueFrom(
      this.http.post<AccountingPaymentPushResult[]>(
        this.config.get('ACCOUNTING_1C_SEND_PAYMENTS_URL', { infer: true })!,
        items,
        {
          auth: {
            username: this.config.get('ACCOUNTING_1C_LOGIN', { infer: true })!,
            password: this.config.get('ACCOUNTING_1C_PASSWORD', { infer: true })!,
          },
          timeout: REQUEST_TIMEOUT_MS,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        },
      ),
    );
    return response.data;
  }

  isFetchConfigured(): boolean {
    return Boolean(
      this.config.get('ACCOUNTING_1C_LOGIN', { infer: true }) &&
        this.config.get('ACCOUNTING_1C_PASSWORD', { infer: true }) &&
        this.config.get('ACCOUNTING_1C_GET_PAYMENTS_URL', { infer: true }),
    );
  }

  // Форма ответа НЕ подтверждена (нет присланного примера, в отличие от pushPayments
  // выше) — предполагаем массив объектов, разбор конкретных полей вынесен в
  // payment-imports/payment-import-candidate.ts (максимально защитно).
  async fetchPayments(): Promise<AccountingRawImportedPayment[]> {
    if (!this.isFetchConfigured()) return [];

    const response = await firstValueFrom(
      this.http.get<AccountingRawImportedPayment[]>(this.config.get('ACCOUNTING_1C_GET_PAYMENTS_URL', { infer: true })!, {
        auth: {
          username: this.config.get('ACCOUNTING_1C_LOGIN', { infer: true })!,
          password: this.config.get('ACCOUNTING_1C_PASSWORD', { infer: true })!,
        },
        timeout: REQUEST_TIMEOUT_MS,
      }),
    );
    return Array.isArray(response.data) ? response.data : [];
  }
}
