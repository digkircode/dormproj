
export interface AccountingSummDetail {
  SummDetails: number;
  TypeDetails: 'Найм' | 'Коммуналка' | 'Пени';
}

export interface AccountingPaymentPush {
  DogovorID: number;
  OplataID: number;

  FizicheskoyeLitsoID?: number;

  ContractorUID?: string;
  ContractUID?: string;

  ContractorFIO: string;
  ContractName: string;
  ContractDate: string;

  Date: string;
  DocumentSumm: number;
  DocumentSummNaim: number;

  OplataContractor: string;
  Osnovanie: string;

  DocumentSummDetails: AccountingSummDetail[];

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
    super('1С Бухгалтерия не настроена - не заполнены реквизиты в переменных окружения');
    this.name = 'Accounting1cNotConfiguredError';
  }
}

export type AccountingRawImportedPayment = Record<string, unknown>;

export interface AccountingContractPair {
  contractorUid: string;
  contractUid: string;
}

export interface AccountingServiceProvisionDetail {
  ContractorUID: string;
  ContractUID: string;
  SummDetails: number;
}

export interface AccountingServiceProvisionPush {
  SiteDocumentID: number;

  Date: string;
  NomenclatureType: 'Найм' | 'Коммуналка' | 'Пени';
  DocumentSumm: number;
  Comment: string;

  DocumentSummDetails: AccountingServiceProvisionDetail[];

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
