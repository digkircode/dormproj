
export interface FiscalReceiptItem {
  name: string;
  price: number;
  quantity: number;
  sum: number;
}

export interface FiscalReceiptInput {
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
    super('Касса не настроена - не заполнены реквизиты в переменных окружения');
    this.name = 'FiscalNotConfiguredError';
  }
}

export interface FiscalProvider {
  isConfigured(): boolean;
  registerReceipt(input: FiscalReceiptInput): Promise<FiscalRegisterResult>;
  getReceiptStatus(uuid: string): Promise<FiscalStatusResult>;
}

export const FISCAL_PROVIDER = Symbol('FISCAL_PROVIDER');
