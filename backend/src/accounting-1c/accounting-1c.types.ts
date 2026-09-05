// Абстракция над обменом с 1С Бухгалтерией: флоу 1 (отправка платежей эквайринга), флоу 2
// (получение платежей, пришедших мимо сайта — касса/перевод/по реквизитам) и флоу 3
// (ежемесячный документ "оказание услуг", см. промпт проекта). Единственная реализация —
// accounting-1c-payments.provider.ts.

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
  // "YYYY-MM-DDT00:00:00" (formatDateOnlyIso), НЕ "ДД.ММ.ГГГГ" — подтверждено реальным
  // примером запроса, см. комментарий у formatDateOnlyIso в build-accounting-payment-payload.ts.
  ContractDate: string;

  Date: string; // дата платежа, тот же формат, что ContractDate выше
  DocumentSumm: number; // итоговая сумма платежа целиком
  DocumentSummNaim: number; // сумма по найму отдельно (дублирует соответствующую строку DocumentSummDetails)

  OplataContractor: string; // ФИО фактического плательщика (может отличаться от резидента)
  Osnovanie: string; // "Назначение платежа"

  DocumentSummDetails: AccountingSummDetail[];

  // Заполняем, если платёж уже был успешно отправлен раньше (Payment.accounting1cDocumentUid)
  // — тот же принцип идемпотентности, что и у AccountingServiceProvisionPush.DocumentUID
  // (флоу 3): повторная отправка (ручной ретрай на уже-SYNCED строке, см. промпт проекта)
  // обновит существующий документ в 1С, а не создаст дубль. При первой отправке не передаём.
  DocumentUID?: string;
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

// Сырое тело одного элемента ответа эндпоинта 2 (AllPaymentDoc) — форма подтверждена
// реальным примером 2026-09-04, разбор всё равно защитный (несколько вариантов имени на
// поле), см. payment-imports/payment-import-candidate.ts.
export type AccountingRawImportedPayment = Record<string, unknown>;

// Пара, которой опознаётся договор на стороне 1С — тот же принцип, что и в запросе
// AllPaymentDoc (реальный пример 2026-09-04): в отличие от эндпоинта 1 (push), это НЕ
// "дай всё новое", а "дай платежи ИМЕННО по этим парам" — 1С не отдаёт общую ленту.
// Значит опросить можно только договоры, у которых обе стороны пары УЖЕ известны нам
// самим (см. payment-imports-ingest.service.ts — откуда берутся пары).
export interface AccountingContractPair {
  contractorUid: string;
  contractUid: string;
}

// Одна строка сводного документа "оказание услуг" (флоу 3, эндпоинт ServProvisionDoc,
// реальный пример 2026-09-04) — в отличие от AccountingSummDetail (флоу 1, там строка =
// тип услуги ВНУТРИ платежа одного человека), тут строка = один договор ВНУТРИ сводного
// документа на весь дом сразу.
export interface AccountingServiceProvisionDetail {
  ContractorUID: string;
  ContractUID: string;
  SummDetails: number; // рубли
}

export interface AccountingServiceProvisionPush {
  // Наш собственный числовой id — 1С его не резолвит, только эхом возвращает обратно
  // для сопоставления с ответом (см. AccountingServiceProvisionPushResult). В отличие от
  // DogovorID/OplataID (флоу 1, реальный PK), тут естественного числового PK нет (одна
  // строка — не одна сущность в нашей БД, а сводный документ на много договоров сразу) —
  // берём ServiceProvisionDocument.id (см. service-provision-doc.service.ts).
  SiteDocumentID: number;

  Date: string; // "YYYY-MM-DDT00:00:00" (formatDateOnlyIso) — 1-е число целевого месяца
  NomenclatureType: 'Найм' | 'Коммуналка';
  DocumentSumm: number; // сумма всех DocumentSummDetails
  Comment: string;

  DocumentSummDetails: AccountingServiceProvisionDetail[];

  // Заполняем при повторной отправке того же документа (см. промпт проекта — "DocumentUID
  // в запросе обновит документ, а не создаст новый"), чтобы не плодить дубли в 1С при
  // ручном повторе после сбоя. При первой отправке не передаём вообще.
  DocumentUID?: string;
}

export interface AccountingServiceProvisionPushResult {
  SiteDocumentID: number;
  FinalStatus: boolean;
  DocumentUID?: string;
  ERROR?: string;
}

export interface Accounting1cProvider {
  isConfigured(): boolean;
  pushPayments(items: AccountingPaymentPush[]): Promise<AccountingPaymentPushResult[]>;
  isFetchConfigured(): boolean;
  fetchPayments(pairs: AccountingContractPair[]): Promise<AccountingRawImportedPayment[]>;
  isServiceProvisionConfigured(): boolean;
  pushServiceProvisionDocs(items: AccountingServiceProvisionPush[]): Promise<AccountingServiceProvisionPushResult[]>;
}

export const ACCOUNTING_1C_PROVIDER = Symbol('ACCOUNTING_1C_PROVIDER');
