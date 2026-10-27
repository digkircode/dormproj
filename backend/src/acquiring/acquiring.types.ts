
export interface AcquiringItem {
  name: string;
  price: number;
  quantity: number;
  sum: number;
}

export interface AcquiringStartInput {
  amount: number;
  description: string;
  orderId: string;
  items: AcquiringItem[];
  returnUrl: string;
  successUrl: string;
  failureUrl: string;
  params?: Record<string, string>;
}

export interface AcquiringStartResult {
  bankToken: string;
  paymentPageUrl: string;
}

export type AcquiringPaymentState = 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED';

export interface AcquiringStatusResult {
  state: AcquiringPaymentState;
  raw: unknown;
  trxId?: string;
  rrn?: string;
  approvalCode?: string;
  failureReason?: string;
}

export class AcquiringNotConfiguredError extends Error {
  constructor() {
    super('Эквайринг не настроен - не заполнены реквизиты банка в переменных окружения');
    this.name = 'AcquiringNotConfiguredError';
  }
}

export interface AcquiringProvider {
  isConfigured(): boolean;
  startPayment(input: AcquiringStartInput): Promise<AcquiringStartResult>;
  getStatus(bankToken: string): Promise<AcquiringStatusResult>;
}

export const ACQUIRING_PROVIDER = Symbol('ACQUIRING_PROVIDER');
