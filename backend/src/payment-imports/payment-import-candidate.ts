import type { AccountingRawImportedPayment } from '../accounting-1c/accounting-1c.types';

// Нормализованные поля одного платежа из 1С (флоу 2) — разобраны из сырого rawPayload
// максимально защитно: ТОЧНАЯ форма ответа эндпоинта 2 не подтверждена 1С-разработчиком
// (в отличие от эндпоинта 1 — там был реальный пример). Предполагаем ту же вокабулярную
// точку, что и у отправки (ContractorUID/ContractUID/ContractorFIO/DocumentSumm/Date/
// Osnovanie/OplataID), но пробуем по несколько вариантов имён на каждое поле — если
// реальный ответ будет отличаться, придётся расширить списки альтернатив ниже, сама
// структура PaymentImportRecord (сырой rawPayload + этот разбор поверх него на чтении,
// не при импорте) допускает это без миграции данных.
export interface PaymentImportCandidate {
  externalId: string;
  contractorUid: string | null;
  contractUid: string | null;
  contractorFio: string | null;
  contractName: string | null;
  amount: number | null;
  paidAt: Date | null;
  comment: string | null;
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
    if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
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
    firstString(raw, ['OplataID', 'PaymentID', 'DocumentUID', 'ID', 'Id']) ??
    // Совсем без стабильного id — придётся дедуплицировать по составному ключу
    // на чтении (сумма+дата+контрагент), не идеально, но лучше, чем терять платёж.
    JSON.stringify(raw);

  return {
    externalId,
    contractorUid: firstString(raw, ['ContractorUID', 'ContragentUID']),
    contractUid: firstString(raw, ['ContractUID', 'DogovorUID']),
    contractorFio: firstString(raw, ['ContractorFIO', 'ContragentFIO', 'FIO']),
    contractName: firstString(raw, ['ContractName', 'DogovorName', 'Number']),
    amount: firstNumber(raw, ['DocumentSumm', 'Summa', 'Amount']),
    paidAt: firstDate(raw, ['Date', 'DocumentDate', 'Data']),
    comment: firstString(raw, ['Osnovanie', 'Comment', 'Naznachenie']),
  };
}
