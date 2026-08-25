import * as fs from 'node:fs';
import * as https from 'node:https';
import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import type { Env } from '../config/env.schema';
import {
  AcquiringNotConfiguredError,
  type AcquiringProvider,
  type AcquiringStartInput,
  type AcquiringStartResult,
  type AcquiringStatusResult,
} from './acquiring.types';

const REQUEST_TIMEOUT_MS = 15_000;

// payment_object=10 ("об авансе, задатке, предоплате, кредите") и НДС "без обложения" —
// по прямой просьбе (2026-08-25), а не по общей таблице кодов из документации ГПБ — эта
// комбинация ФИКСИРОВАННАЯ для всех позиций корзины, не вычисляется.
const PAYMENT_OBJECT = 10;

interface StartPaymentResponse {
  state: string;
  paymentPageUrl?: string;
  url?: string;
  error?: string;
}

interface StatusResponse {
  state: 'in_progress' | 'result' | 'redirect' | string;
  result?: {
    status: string;
    trxId?: string;
    rrn?: string;
    approvalCode?: string;
    extendedCode?: string;
  };
  error?: string;
  errorDetail?: string;
}

// Единственная реализация AcquiringProvider — эквайринг ГПБ, сценарий "Платежные страницы
// Банка" (без CPA/RP — двухфазный inbound-протокол ГПБ→нас в документации на момент
// изучения 2026-08-25 не описан полями запроса/ответа, только общей схемой, поэтому вместо
// него используется опрос статуса нашим сервером — тот же принцип "не доверять редиректу
// браузера", см. промпт задачи). Скелет: реальные HTTP-вызовы к банку написаны по
// документации из C:\Users\fedoseev\Desktop\gpb, но ни разу не выполнялись (нет боевых
// реквизитов/сертификата) — при первом реальном вызове возможны неточности в названиях
// полей, сверить с логами первого же запроса.
@Injectable()
export class GazprombankAcquiringProvider implements AcquiringProvider {
  private readonly logger = new Logger(GazprombankAcquiringProvider.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get('GPB_ACQUIRING_BASE_URL', { infer: true }) &&
        this.config.get('GPB_ACQUIRING_PORTAL_ID', { infer: true }) &&
        this.config.get('GPB_ACQUIRING_MERCHANT_ID', { infer: true }) &&
        this.config.get('GPB_ACQUIRING_CLIENT_CERT_PATH', { infer: true }) &&
        this.config.get('GPB_ACQUIRING_CLIENT_KEY_PATH', { infer: true }),
    );
  }

  // mTLS-сертификат ТСП — по словам пользователя, доступ к API банка требует сертификата
  // (см. промпт задачи). Пока файлы не указаны/не существуют — httpsAgent не строится,
  // isConfigured() в этом случае уже вернул false раньше, сюда не доходим.
  private buildHttpsAgent(): https.Agent {
    const certPath = this.config.get('GPB_ACQUIRING_CLIENT_CERT_PATH', { infer: true });
    const keyPath = this.config.get('GPB_ACQUIRING_CLIENT_KEY_PATH', { infer: true });
    const passphrase = this.config.get('GPB_ACQUIRING_CLIENT_KEY_PASSPHRASE', { infer: true });
    return new https.Agent({
      cert: fs.readFileSync(certPath!),
      key: fs.readFileSync(keyPath!),
      passphrase,
    });
  }

  private baseUrl(): string {
    return this.config.get('GPB_ACQUIRING_BASE_URL', { infer: true })!.replace(/\/+$/, '');
  }

  private portalId(): string {
    return this.config.get('GPB_ACQUIRING_PORTAL_ID', { infer: true })!;
  }

  private async fetchToken(httpsAgent: https.Agent): Promise<string> {
    const response = await firstValueFrom(
      this.http.post<{ token: string }>(
        `${this.baseUrl()}/api/v4/${this.portalId()}/token`,
        {},
        { httpsAgent, timeout: REQUEST_TIMEOUT_MS },
      ),
    );
    return response.data.token;
  }

  async startPayment(input: AcquiringStartInput): Promise<AcquiringStartResult> {
    if (!this.isConfigured()) throw new AcquiringNotConfiguredError();
    const httpsAgent = this.buildHttpsAgent();
    const token = await this.fetchToken(httpsAgent);

    // Форма запроса — плоские ключи с точечной нотацией (items.0.name и т.п.), см.
    // "Старта платежа (формат и параметры)"/"Параметры корзины items" в документации ГПБ.
    const form = new URLSearchParams();
    form.set('merchantId', this.config.get('GPB_ACQUIRING_MERCHANT_ID', { infer: true })!);
    const accountId = this.config.get('GPB_ACQUIRING_ACCOUNT_ID', { infer: true });
    if (accountId) form.set('accountId', accountId);
    form.set('description', input.description.slice(0, 125));
    form.set('currency', 'RUB');
    // Сумма в минорных единицах (копейках) — см. "Минорная единица" в терминах ГПБ.
    form.set('amount', String(Math.round(input.amount * 100)));
    form.set('params.order_id', input.orderId);
    for (const [key, value] of Object.entries(input.params ?? {})) {
      form.set(`params.${key}`, value);
    }
    form.set('returnUrl', input.returnUrl);
    form.set('back_url_s', input.successUrl);
    form.set('back_url_f', input.failureUrl);
    // payment_page — сценарий "Платежные страницы Банка" без CPA, без PCI DSS с нашей
    // стороны (см. промпт задачи) — ответ содержит готовый paymentPageUrl.
    form.set('state.redirect', 'payment_page');
    form.set('state.in_progress', 'no');
    form.set('lang', 'ru');

    input.items.forEach((item, i) => {
      form.set(`items.${i}.name`, item.name.slice(0, 128));
      form.set(`items.${i}.price`, String(Math.round(item.price * 100)));
      form.set(`items.${i}.quantity`, String(item.quantity));
      form.set(`items.${i}.sum`, String(Math.round(item.sum * 100)));
      form.set(`items.${i}.payment_method`, 'full_prepayment');
      form.set(`items.${i}.payment_object`, String(PAYMENT_OBJECT));
      form.set(`items.${i}.vat.type`, 'none');
    });

    const response = await firstValueFrom(
      this.http.post<StartPaymentResponse>(
        `${this.baseUrl()}/api/v4/${this.portalId()}/payment/${token}/start`,
        form,
        {
          httpsAgent,
          timeout: REQUEST_TIMEOUT_MS,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      ),
    );

    const paymentPageUrl = response.data.paymentPageUrl ?? response.data.url;
    if (!paymentPageUrl) {
      this.logger.error(`Старт платежа ГПБ не вернул ссылку на оплату: state=${response.data.state}`);
      throw new Error('Банк не вернул ссылку на страницу оплаты');
    }

    return { bankToken: token, paymentPageUrl };
  }

  async getStatus(bankToken: string): Promise<AcquiringStatusResult> {
    if (!this.isConfigured()) throw new AcquiringNotConfiguredError();
    const httpsAgent = this.buildHttpsAgent();

    const response = await firstValueFrom(
      this.http.get<StatusResponse>(`${this.baseUrl()}/api/v4/${this.portalId()}/payment/${bankToken}`, {
        httpsAgent,
        timeout: REQUEST_TIMEOUT_MS,
      }),
    );
    const data = response.data;

    if (data.state === 'in_progress' || data.state === 'redirect') {
      return { state: 'IN_PROGRESS', raw: data };
    }
    if (data.state === 'result' && data.result) {
      const success = data.result.status === 'SUCCESS';
      return {
        state: success ? 'SUCCEEDED' : 'FAILED',
        raw: data,
        trxId: data.result.trxId,
        rrn: data.result.rrn,
        approvalCode: data.result.approvalCode,
        failureReason: success ? undefined : (data.result.extendedCode ?? data.error),
      };
    }
    // Неизвестное/промежуточное состояние (offer/iframe/3ds2_* и т.п., см. "Значения поля
    // state") — для нашего сценария payment_page их быть не должно, но на всякий случай
    // не считаем это финалом, а просто просим клиента подождать и переопросить позже.
    return { state: 'IN_PROGRESS', raw: data };
  }
}
