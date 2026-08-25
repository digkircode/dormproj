// Абстракция над кассой (фискализация чеков) — единственная реализация сейчас
// (Эвотор/АТОЛ Онлайн "Цифровая касса", см. atol-fiscal.provider.ts).

export interface FiscalReceiptItem {
  name: string;
  price: number; // рубли, за единицу
  quantity: number;
  sum: number; // рубли
}

export interface FiscalReceiptInput {
  // Уникален среди документов, отправленных нашим логином — используем id PaymentIntent.
  externalId: string;
  items: FiscalReceiptItem[];
  total: number;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  callbackUrl?: string;
}

export interface FiscalRegisterResult {
  uuid: string;
}

export type FiscalReceiptState = 'WAIT' | 'DONE' | 'FAIL';

export interface FiscalStatusResult {
  state: FiscalReceiptState;
  receiptUrl?: string;
  raw: unknown;
  failureReason?: string;
}

export class FiscalNotConfiguredError extends Error {
  constructor() {
    super('Касса не настроена — не заполнены реквизиты в переменных окружения');
    this.name = 'FiscalNotConfiguredError';
  }
}

export interface FiscalProvider {
  isConfigured(): boolean;
  registerReceipt(input: FiscalReceiptInput): Promise<FiscalRegisterResult>;
  getReceiptStatus(uuid: string): Promise<FiscalStatusResult>;
}

export const FISCAL_PROVIDER = Symbol('FISCAL_PROVIDER');
