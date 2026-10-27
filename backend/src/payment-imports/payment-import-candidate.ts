import type { AccountingRawImportedPayment } from '../accounting-1c/accounting-1c.types';
import type { PaymentMethod } from '../../generated/prisma/client.js';

export function paymentMethodFromType(type: string | null): PaymentMethod | null {
  if (type === 'Операция по платежной карте') return 'CARD_ACQUIRING';
  if (type === 'Поступление наличных') return 'CASH';
  return null;
}

export interface PaymentImportCandidate {
  externalId: string;
  contractorUid: string | null;
  contractUid: string | null;
  contractorFio: string | null;
  contractName: string | null;
  amount: number | null;
  paidAt: Date | null;
  comment: string | null;
  type: string | null;
}

function firstString(raw: AccountingRawImportedPayment, keys: string[]): string | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}

function firstNumber(raw: AccountingRawImportedPayment, keys: string[]): number | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const cleaned = value.replace(/\s/g, '');
      if (cleaned !== '' && !Number.isNaN(Number(cleaned))) return Number(cleaned);
    }
  }
  return null;
}

function firstDate(raw: AccountingRawImportedPayment, keys: string[]): Date | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value !== 'string' || !value) continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

export function parsePaymentImportCandidate(raw: AccountingRawImportedPayment): PaymentImportCandidate {
  const externalId =
    firstString(raw, ['DocumentUID', 'OplataID', 'PaymentID', 'ID', 'Id']) ??
    JSON.stringify(raw);

  return {
    externalId,
    contractorUid: firstString(raw, ['ContractorUID', 'ContragentUID']),
    contractUid: firstString(raw, ['ContractUID', 'DogovorUID']),
    contractorFio: firstString(raw, ['Contractor', 'ContractorFIO', 'ContragentFIO', 'FIO']),
    contractName: firstString(raw, ['Contract', 'ContractName', 'DogovorName', 'Number']),
    amount: firstNumber(raw, ['DocumentSumm', 'Summa', 'Amount']),
    paidAt: firstDate(raw, ['Period', 'Date', 'DocumentDate', 'Data']),
    comment: firstString(raw, ['Osnovanie', 'Comment', 'Naznachenie']),
    type: firstString(raw, ['Type']),
  };
}
