// Абстракция над банком-эквайером — единственная реализация сейчас (Gazprombank, см.
// gazprombank-acquiring.provider.ts), но my-payments.controller.ts работает только через
// этот интерфейс, чтобы при смене банка не трогать бизнес-логику онлайн-оплаты.

export interface AcquiringItem {
  name: string;
  price: number; // рубли, за единицу
  quantity: number;
  sum: number; // рубли, price*quantity
}

export interface AcquiringStartInput {
  amount: number; // рубли, сумма к оплате целиком
  description: string;
  // Наш orderId (PaymentIntent.id как строка) — эхо в статусе платежа, см.
  // params.order_id в документации ГПБ.
  orderId: string;
  items: AcquiringItem[];
  returnUrl: string;
  successUrl: string;
  failureUrl: string;
  params?: Record<string, string>;
}

export interface AcquiringStartResult {
  // Токен транзакции банка — сохраняется в PaymentIntent.bankToken, дальше им же
  // опрашивается статус (getStatus).
  bankToken: string;
  paymentPageUrl: string;
}

export type AcquiringPaymentState = 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED';

export interface AcquiringStatusResult {
  state: AcquiringPaymentState;
  // Сырой ответ банка — целиком в PaymentIntent.bankRawStatus, для разбора спорных
  // случаев без похода в логи банка.
  raw: unknown;
  trxId?: string;
  rrn?: string;
  approvalCode?: string;
  failureReason?: string;
}

// Бросается провайдером, если реквизиты банка ещё не заполнены в .env — единая точка,
// по которой my-payments.controller.ts отличает "банк не настроен" от реальной ошибки
// платежа (см. решение "блокировать понятным сообщением", обсуждение 2026-08-25).
export class AcquiringNotConfiguredError extends Error {
  constructor() {
    super('Эквайринг не настроен — не заполнены реквизиты банка в переменных окружения');
    this.name = 'AcquiringNotConfiguredError';
  }
}

export interface AcquiringProvider {
  isConfigured(): boolean;
  startPayment(input: AcquiringStartInput): Promise<AcquiringStartResult>;
  getStatus(bankToken: string): Promise<AcquiringStatusResult>;
}

export const ACQUIRING_PROVIDER = Symbol('ACQUIRING_PROVIDER');
