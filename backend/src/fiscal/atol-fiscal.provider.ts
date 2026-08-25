import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import type { Env } from '../config/env.schema';
import {
  FiscalNotConfiguredError,
  type FiscalProvider,
  type FiscalReceiptInput,
  type FiscalRegisterResult,
  type FiscalStatusResult,
} from './fiscal.types';

const DEFAULT_BASE_URL = 'https://fiscalization.evotor.ru';
const REQUEST_TIMEOUT_MS = 15_000;
// Токен живёт 24ч на стороне сервиса (см. "Получение токена" в документации Эвотор) —
// перезапрашиваем чуть раньше, с запасом, а не ровно по истечении.
const TOKEN_TTL_MS = 23 * 60 * 60_000;

// payment_object=10, НДС "без обложения" — по прямой просьбе (2026-08-25), см. ту же
// заметку в gazprombank-acquiring.provider.ts.
const PAYMENT_OBJECT = 10;

interface GetTokenResponse {
  token?: string;
  error?: { error_id: string; code: number; text: string; type: string } | null;
}

interface RegisterReceiptResponse {
  uuid?: string;
  status: 'wait' | 'fail';
  error?: { error_id: string; code: number; text: string; type: string } | null;
}

interface ReceiptStatusResponse {
  status: 'wait' | 'done' | 'fail';
  error?: { text: string } | null;
  payload?: {
    fn_number: string;
    fiscal_document_number: number;
    fiscal_document_attribute: number;
    ofd_receipt_url?: string;
  } | null;
}

function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// Единственная реализация FiscalProvider — Цифровая касса Эвотор (коннектор АТОЛ Онлайн,
// https://docs.evotor.online). Скелет по документации, ни разу не выполнялся против
// реального сервиса (нет боевого логина/пароля/group_code) — сверить с логами первого
// же вызова, когда реквизиты появятся.
@Injectable()
export class AtolFiscalProvider implements FiscalProvider {
  private readonly logger = new Logger(AtolFiscalProvider.name);
  private cachedToken: { token: string; expiresAt: number } | null = null;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get('ATOL_KASSA_LOGIN', { infer: true }) &&
        this.config.get('ATOL_KASSA_PASSWORD', { infer: true }) &&
        this.config.get('ATOL_KASSA_GROUP_CODE', { infer: true }) &&
        this.config.get('ATOL_KASSA_COMPANY_INN', { infer: true }) &&
        this.config.get('ATOL_KASSA_COMPANY_EMAIL', { infer: true }) &&
        this.config.get('ATOL_KASSA_COMPANY_SNO', { infer: true }) &&
        this.config.get('ATOL_KASSA_PAYMENT_ADDRESS', { infer: true }),
    );
  }

  private baseUrl(): string {
    return (this.config.get('ATOL_KASSA_BASE_URL', { infer: true }) ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  }

  private groupCode(): string {
    return this.config.get('ATOL_KASSA_GROUP_CODE', { infer: true })!;
  }

  private async getToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) {
      return this.cachedToken.token;
    }
    const response = await firstValueFrom(
      this.http.post<GetTokenResponse>(
        `${this.baseUrl()}/possystem/v5/getToken`,
        {
          login: this.config.get('ATOL_KASSA_LOGIN', { infer: true }),
          pass: this.config.get('ATOL_KASSA_PASSWORD', { infer: true }),
        },
        { timeout: REQUEST_TIMEOUT_MS, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
      ),
    );
    if (!response.data.token) {
      throw new Error(`Касса не выдала токен: ${response.data.error?.text ?? 'неизвестная ошибка'}`);
    }
    this.cachedToken = { token: response.data.token, expiresAt: Date.now() + TOKEN_TTL_MS };
    return response.data.token;
  }

  async registerReceipt(input: FiscalReceiptInput): Promise<FiscalRegisterResult> {
    if (!this.isConfigured()) throw new FiscalNotConfiguredError();
    const token = await this.getToken();

    const body = {
      timestamp: formatTimestamp(new Date()),
      external_id: input.externalId,
      service: input.callbackUrl ? { callback_url: input.callbackUrl } : undefined,
      receipt: {
        client: {
          email: input.clientEmail ?? undefined,
          phone: input.clientPhone ?? undefined,
          name: input.clientName,
        },
        company: {
          email: this.config.get('ATOL_KASSA_COMPANY_EMAIL', { infer: true }),
          sno: this.config.get('ATOL_KASSA_COMPANY_SNO', { infer: true }),
          inn: this.config.get('ATOL_KASSA_COMPANY_INN', { infer: true }),
          payment_address: this.config.get('ATOL_KASSA_PAYMENT_ADDRESS', { infer: true }),
        },
        items: input.items.map((item) => ({
          name: item.name.slice(0, 128),
          price: item.price,
          quantity: item.quantity,
          measure: 0,
          sum: item.sum,
          payment_method: 'full_prepayment',
          payment_object: PAYMENT_OBJECT,
          vat: { type: 'none' },
        })),
        payments: [{ type: 1, sum: input.total }],
        total: input.total,
      },
    };

    const response = await firstValueFrom(
      this.http.post<RegisterReceiptResponse>(`${this.baseUrl()}/possystem/v5/${this.groupCode()}/sell`, body, {
        timeout: REQUEST_TIMEOUT_MS,
        headers: { 'Content-Type': 'application/json; charset=utf-8', Token: token },
      }),
    );

    if (!response.data.uuid) {
      this.logger.error(`Регистрация чека не удалась: ${response.data.error?.text ?? 'без описания'}`);
      throw new Error(`Касса отклонила чек: ${response.data.error?.text ?? 'неизвестная ошибка'}`);
    }
    return { uuid: response.data.uuid };
  }

  async getReceiptStatus(uuid: string): Promise<FiscalStatusResult> {
    if (!this.isConfigured()) throw new FiscalNotConfiguredError();
    const token = await this.getToken();

    const response = await firstValueFrom(
      this.http.get<ReceiptStatusResponse>(`${this.baseUrl()}/possystem/v5/${this.groupCode()}/report/${uuid}`, {
        timeout: REQUEST_TIMEOUT_MS,
        headers: { Token: token },
      }),
    );
    const data = response.data;

    if (data.status === 'wait') return { state: 'WAIT', raw: data };
    if (data.status === 'fail') return { state: 'FAIL', raw: data, failureReason: data.error?.text };

    // done — ofd_receipt_url отдаётся не всегда (см. документацию), собираем ссылку
    // на просмотр чека сами из fn/fp/i по тому же шаблону, что и прислали в задаче:
    // https://lk.platformaofd.ru/web/noauth/cheque/search?fn=...&fp=...&i=...
    const payload = data.payload;
    const receiptUrl =
      payload?.ofd_receipt_url ??
      (payload
        ? `https://lk.platformaofd.ru/web/noauth/cheque/search?fn=${payload.fn_number}&fp=${payload.fiscal_document_attribute}&i=${payload.fiscal_document_number}`
        : undefined);
    return { state: 'DONE', raw: data, receiptUrl };
  }
}
