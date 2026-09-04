import type { AccountingRawImportedPayment } from '../accounting-1c/accounting-1c.types';

// Нормализованные поля одного платежа из 1С (флоу 2, эндпоинт AllPaymentDoc) — разобраны
// из сырого rawPayload. Реальный пример ответа получен 2026-09-04 (см. промпт проекта) —
// ключи ниже теперь настоящие (Period/Contractor/DocumentUID/...), не угаданные, но
// firstString/firstNumber/firstDate по-прежнему пробуют по несколько вариантов на
// случай, если форма чуть разъедется между разными типами документов (карта/касса/...).
export interface PaymentImportCandidate {
  externalId: string;
  contractorUid: string | null;
  contractUid: string | null;
  contractorFio: string | null;
  contractName: string | null;
  amount: number | null;
  paidAt: Date | null;
  comment: string | null;
  // Как поступил платёж (Type — подтверждённое реальное поле AllPaymentDoc, реальные
  // примеры: "Операция по платежной карте"/"Поступление наличных") — по прямой просьбе
  // 2026-09-04, показывается сотруднику в модалке разбора записи.
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
      // 1С отдаёт суммы строкой с разрядным разделителем-пробелом (например "7 000",
      // реальный пример от 2026-09-04) — обычный пробел ИЛИ неразрывный ( ),
      // Number() на таком без чистки даёт NaN. Убираем все пробельные символы целиком,
      // не только по краям (trim() их не трогает — они посреди строки).
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
    // Совсем без стабильного id — придётся дедуплицировать по составному ключу
    // на чтении (сумма+дата+контрагент), не идеально, но лучше, чем терять платёж.
    JSON.stringify(raw);

  return {
    externalId,
    contractorUid: firstString(raw, ['ContractorUID', 'ContragentUID']),
    contractUid: firstString(raw, ['ContractUID', 'DogovorUID']),
    // Contractor — подтверждённое реальное поле (AllPaymentDoc), ContractorFIO — из
    // отправки (флоу 1, PaymentDocuments), оставлен на случай другого типа документа.
    contractorFio: firstString(raw, ['Contractor', 'ContractorFIO', 'ContragentFIO', 'FIO']),
    contractName: firstString(raw, ['Contract', 'ContractName', 'DogovorName', 'Number']),
    amount: firstNumber(raw, ['DocumentSumm', 'Summa', 'Amount']),
    // Period — подтверждённое реальное поле, Date — из отправки (флоу 1), не из этого эндпоинта.
    paidAt: firstDate(raw, ['Period', 'Date', 'DocumentDate', 'Data']),
    comment: firstString(raw, ['Osnovanie', 'Comment', 'Naznachenie']),
    type: firstString(raw, ['Type']),
  };
}
