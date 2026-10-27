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

    const form = new URLSearchParams();
    form.set('merchantId', this.config.get('GPB_ACQUIRING_MERCHANT_ID', { infer: true })!);
    const accountId = this.config.get('GPB_ACQUIRING_ACCOUNT_ID', { infer: true });
    if (accountId) form.set('accountId', accountId);
    form.set('description', input.description.slice(0, 125));
    form.set('currency', 'RUB');
    form.set('amount', String(Math.round(input.amount * 100)));
    form.set('params.order_id', input.orderId);
    for (const [key, value] of Object.entries(input.params ?? {})) {
      form.set(`params.${key}`, value);
    }
    form.set('returnUrl', input.returnUrl);
    form.set('back_url_s', input.successUrl);
    form.set('back_url_f', input.failureUrl);
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
    return { state: 'IN_PROGRESS', raw: data };
  }
}
