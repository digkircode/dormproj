// Абстракция над обменом с 1С Бухгалтерией: флоу 1 (отправка платежей эквайринга) и флоу 2
// (получение платежей, пришедших мимо сайта — касса/перевод/по реквизитам, см. промпт
// проекта). Единственная реализация — accounting-1c-payments.provider.ts. Флоу 3 (документ
// "оказание услуг") сюда не входит — отдельный, ещё не реализованный поток.

export interface AccountingSummDetail {
  SummDetails: number; // рубли
  TypeDetails: 'Найм' | 'Коммуналка' | 'Пени';
}

export interface AccountingPaymentPush {
  // Наши собственные числовые идентификаторы — 1С их не резолвит, только эхом
  // возвращает обратно для сопоставления с ответом (см. AccountingPaymentPushResult).
  DogovorID: number; // Contract.id
  OplataID: number; // Payment.id

  // ОТКРЫТЫЙ ВОПРОС (не решено на 2026-09-03) — числовой ID физлица в отдельном
  // пространстве 1С Бухгалтерии, не совпадает с нашим Individual.fizicheskoyeLitsoUid
  // (тот — GUID из другой, студенческой 1С). У нас нет аналога этого числа — нужно
  // уточнить у 1С-разработчика: обязательно ли поле, и если да — auto-присваивается ли
  // оно (как ContractorUID/ContractUID) и нужно ли нам его запоминать так же. Пока не
  // передаём вообще, см. build-accounting-payment-payload.ts.
  FizicheskoyeLitsoID?: number;

  // Заполняем, если уже известны с прошлой успешной отправки (см.
  // Individual.accounting1cContractorUid / Contract.accounting1cUid) — 1С сама
  // создаёт контрагента/договор при первой отправке, если поля не переданы.
  ContractorUID?: string;
  ContractUID?: string;

  ContractorFIO: string;
  ContractName: string; // номер договора (Contract.number)
  ContractDate: string; // ДД.ММ.ГГГГ

  Date: string; // дата платежа, ДД.ММ.ГГГГ
  DocumentSumm: number; // итоговая сумма платежа целиком
  DocumentSummNaim: number; // сумма по найму отдельно (дублирует соответствующую строку DocumentSummDetails)

  OplataContractor: string; // ФИО фактического плательщика (может отличаться от резидента)
  Osnovanie: string; // "Назначение платежа"

  DocumentSummDetails: AccountingSummDetail[];
}

export interface AccountingPaymentPushResult {
  DogovorID: number;
  OplataID: number;
  FinalStatus: boolean;
  DocumentUID?: string;
  ContractorUID?: string;
  ContractUID?: string;
  ERROR?: string;
}

export class Accounting1cNotConfiguredError extends Error {
  constructor() {
    super('1С Бухгалтерия не настроена — не заполнены реквизиты в переменных окружения');
    this.name = 'Accounting1cNotConfiguredError';
  }
}

// Сырое тело одного элемента ответа эндпоинта 2 — точная форма НЕ подтверждена (нет
// присланного примера ответа, в отличие от эндпоинта 1, см. payment-imports/
// payment-import-candidate.ts, где это разбирается максимально защитно, с расчётом на
// то, что реальные имена полей могут отличаться от предположенных).
export type AccountingRawImportedPayment = Record<string, unknown>;

export interface Accounting1cProvider {
  isConfigured(): boolean;
  pushPayments(items: AccountingPaymentPush[]): Promise<AccountingPaymentPushResult[]>;
  isFetchConfigured(): boolean;
  fetchPayments(): Promise<AccountingRawImportedPayment[]>;
}

export const ACCOUNTING_1C_PROVIDER = Symbol('ACCOUNTING_1C_PROVIDER');
