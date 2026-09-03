import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import type { Env } from '../config/env.schema';
import {
  Accounting1cNotConfiguredError,
  type Accounting1cProvider,
  type AccountingContractPair,
  type AccountingPaymentPush,
  type AccountingPaymentPushResult,
  type AccountingRawImportedPayment,
  type AccountingServiceProvisionPush,
  type AccountingServiceProvisionPushResult,
} from './accounting-1c.types';

const REQUEST_TIMEOUT_MS = 30_000;

// Basic Auth — тот же приём, что и у остальных интеграций с 1С в проекте (см.
// sync/external-student-api.service.ts). Три метода — отправка платежей эквайринга
// (флоу 1), получение платежей мимо сайта (флоу 2) и ежемесячный документ "оказание
// услуг" (флоу 3) — независимо настраиваемые (может быть включён только часть URL).
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

  // AllPaymentDoc — POST, не GET (реальный пример 2026-09-04): 1С не отдаёт общую ленту
  // новых платежей, а отвечает только по переданным парам ContractorUID/ContractUID.
  // Пустой список пар — не ошибка, просто нечего спрашивать (см. ingest-service, откуда
  // пары берутся).
  async fetchPayments(pairs: AccountingContractPair[]): Promise<AccountingRawImportedPayment[]> {
    if (!this.isFetchConfigured() || pairs.length === 0) return [];

    const response = await firstValueFrom(
      this.http.post<AccountingRawImportedPayment[]>(
        this.config.get('ACCOUNTING_1C_GET_PAYMENTS_URL', { infer: true })!,
        pairs.map((p) => ({ ContractorUID: p.contractorUid, ContractUID: p.contractUid })),
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
    return Array.isArray(response.data) ? response.data : [];
  }

  isServiceProvisionConfigured(): boolean {
    return Boolean(
      this.config.get('ACCOUNTING_1C_LOGIN', { infer: true }) &&
        this.config.get('ACCOUNTING_1C_PASSWORD', { infer: true }) &&
        this.config.get('ACCOUNTING_1C_SERVICE_PROVISION_URL', { infer: true }),
    );
  }

  // ServProvisionDoc — та же форма, что и pushPayments (эхо SiteDocumentID вместо
  // DogovorID/OplataID), см. AccountingServiceProvisionPush.
  async pushServiceProvisionDocs(items: AccountingServiceProvisionPush[]): Promise<AccountingServiceProvisionPushResult[]> {
    if (!this.isServiceProvisionConfigured()) throw new Accounting1cNotConfiguredError();
    if (items.length === 0) return [];

    const response = await firstValueFrom(
      this.http.post<AccountingServiceProvisionPushResult[]>(
        this.config.get('ACCOUNTING_1C_SERVICE_PROVISION_URL', { infer: true })!,
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
}
