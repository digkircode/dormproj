import { apiFetch } from './api-base'
import { fetchListPage, fetchListFacets, type ListOptions, type ListPage, type FacetOption } from './list-api'
import { i18n } from '@/i18n'

export type ContractStatus = 'ACTIVE' | 'EXPIRING' | 'OVERDUE' | 'COMPLETED' | 'TERMINATED'
export type DailyRateCategory = 'OWN_UNIVERSITY' | 'OTHER_UNIVERSITY'
export type PaymentMethod = 'CASH' | 'CARD_ACQUIRING' | 'BANK_TRANSFER' | 'MAT_CAPITAL' | 'WEBSITE'

export interface ContractListItem {
  id: number
  number: string
  contractDate: string
  status: ContractStatus
  startDate: string
  endDate: string
  actualEndDate: string | null
  residentIndividualUid: string
  residentFullName: string
  room: string | null
  roomId: number | null
  accounting1cMatched: boolean
}

export type ContractsPage = ListPage<ContractListItem>
export type FetchContractsOptions = ListOptions
export type { FacetOption }

export interface ContractTerms {
  id: number
  validFrom: string
  validTo: string | null
  rentAmount: number
  utilitiesAmount: number
  dailyRateCategory: DailyRateCategory
  dailyRateAmount: number
  paymentDueDay: number
}

export interface AccrualRow {
  id: number
  periodStart: string
  periodEnd: string
  dueDate: string
  rentAmount: number
  utilitiesAmount: number
  adjustmentAmount: number
  adjustmentReason: string | null
  voidedAt: string | null
  total: number
  paid: number
  paidRefundedAmount: number
  refundedAmount: number
  balance: number
}

export interface ContractRefundRow {
  id: number
  amount: number
  adjustmentAmount: number
  refundedAt: string
  comment: string | null
  accrualId: number | null
  periodStart: string | null
}

export type Accounting1cSyncStatus = 'NOT_SYNCED' | 'SYNCED' | 'FAILED'

export interface PaymentRow {
  id: number
  amount: number
  paidAt: string
  method: PaymentMethod
  source: string
  externalRef: string | null
  rawComment: string | null
  reversedAt: string | null
  createdAt: string
  purpose?: string
  accounting1cSyncStatus?: Accounting1cSyncStatus
  accounting1cDocumentUid?: string | null
  accounting1cSyncError?: string | null
  accounting1cSyncedAt?: string | null
}

export interface ContractDetail {
  id: number
  number: string
  contractDate: string
  startDate: string
  endDate: string
  actualEndDate: string | null
  status: ContractStatus
  createdAt: string
  residentFullName: string
  residentIndividualUid: string
  currentRoom: { id: number; room: string } | null
  accounting1cUid: string | null
  accounting1cContractorUid: string | null
  legalRepName: string | null
  legalRepPhone: string | null
  legalRepGender: string | null
  legalRepBirthDate: string | null
  legalRepPassportSeries: string | null
  legalRepPassportNumber: string | null
  legalRepPassportIssuedBy: string | null
  legalRepPassportIssuedCode: string | null
  legalRepPassportIssuedAt: string | null
  legalRepSnils: string | null
  legalRepInn: string | null
  legalRepAddress: string | null
  matCapitalCoveredFrom: string | null
  matCapitalCoveredTo: string | null
  matCapitalAmount: number | null
  matCapitalDeferredUntil: string | null
  penaltyAmount: number
  penaltyPaid: number
  penaltyBalance: number
  creditBalance: number
  penaltyLog: PenaltyLogRow[]
  terms: ContractTerms[]
  accruals: AccrualRow[]
  payments: PaymentRow[]
  refunds: ContractRefundRow[]
  refundableAmount: number
  refundSources: { correctionAmount: number; overpaymentAmount: number }
  hasPayments: boolean
}

export interface PenaltyLogRow {
  date: string
  amount: number
  overdueBase: number
}

export interface MyContractDetail {
  id: number
  number: string
  contractDate: string
  startDate: string
  endDate: string
  actualEndDate: string | null
  status: ContractStatus
  createdAt: string
  currentRoom: { id: number; room: string; corpus: string | null; floor: number | null; capacity: number | null } | null
  penaltyAmount: number
  penaltyPaid: number
  penaltyBalance: number
  creditBalance: number
  penaltyLog: PenaltyLogRow[]
  terms: ContractTerms[]
  accruals: AccrualRow[]
  payments: PaymentRow[]
}

export async function fetchMyContract(contractId?: number): Promise<MyContractDetail | null> {
  const response = await apiFetch(contractId ? `/my-contract?contractId=${contractId}` : '/my-contract')
  if (!response.ok) {
    throw new Error(i18n.global.t('contracts.errors.fetchContractFailed', { status: response.status }))
  }
  const data: { contract: MyContractDetail | null } = await response.json()
  return data.contract
}

export interface MyContractHomeSummary {
  number: string
  createdAt: string
  currentRoom: { room: string; floor: number | null } | null
  totalBalance: number
  nextAccrual: { dueDate: string; balance: number } | null
}

export async function fetchMyContractHomeSummary(): Promise<MyContractHomeSummary | null> {
  const response = await apiFetch('/my-contract/summary')
  if (!response.ok) {
    throw new Error(i18n.global.t('contracts.errors.fetchContractFailed', { status: response.status }))
  }
  const data: { contract: MyContractHomeSummary | null } = await response.json()
  return data.contract
}

export async function fetchDemoContractHomeSummary(): Promise<MyContractHomeSummary | null> {
  const response = await apiFetch('/contracts/demo-home-summary')
  if (!response.ok) {
    throw new Error(i18n.global.t('contracts.errors.fetchContractFailed', { status: response.status }))
  }
  const data: { contract: MyContractHomeSummary | null } = await response.json()
  return data.contract
}

export interface MyContractSummary {
  id: number
  number: string
  status: ContractStatus
  contractDate: string
  endDate: string
}

export async function fetchMyContracts(): Promise<MyContractSummary[]> {
  const response = await apiFetch('/my-contract/list')
  if (!response.ok) {
    throw new Error(i18n.global.t('contracts.errors.fetchContractsListFailed', { status: response.status }))
  }
  const data: { contracts: MyContractSummary[] } = await response.json()
  return data.contracts
}

export interface LegalRepPrefill {
  legalRepName: string | null
  legalRepPhone: string | null
  legalRepGender: string | null
  legalRepBirthDate: string | null
  legalRepPassportSeries: string | null
  legalRepPassportNumber: string | null
  legalRepPassportIssuedBy: string | null
  legalRepPassportIssuedCode: string | null
  legalRepPassportIssuedAt: string | null
  legalRepSnils: string | null
  legalRepInn: string | null
  legalRepAddress: string | null
}

export interface CreateContractInput {
  number: string
  contractDate: string
  residentIndividualUid: string
  roomId: number
  startDate: string
  endDate: string
  roomCost: number
  rentAmount: number
  utilitiesAmount: number
  dailyRateCategory: DailyRateCategory
  dailyRateAmount: number
  paymentDueDay?: number
  residenceReason?: string | null
  legalRepName?: string | null
  legalRepPhone?: string | null
  legalRepGender?: 'Мужской' | 'Женский' | null
  legalRepBirthDate?: string | null
  legalRepPassportSeries?: string | null
  legalRepPassportNumber?: string | null
  legalRepPassportIssuedBy?: string | null
  legalRepPassportIssuedCode?: string | null
  legalRepPassportIssuedAt?: string | null
  legalRepSnils?: string | null
  legalRepInn?: string | null
  legalRepAddress?: string | null
  matCapitalCoveredFrom?: string | null
  matCapitalCoveredTo?: string | null
  matCapitalAmount?: number | null
  matCapitalDeferredUntil?: string | null
}

export function fetchContractsPage(options: FetchContractsOptions, signal?: AbortSignal): Promise<ContractsPage> {
  return fetchListPage<ContractListItem>('/contracts', options, undefined, signal)
}

export function fetchContractFacets(field: string): Promise<FacetOption[]> {
  return fetchListFacets('/contracts', field)
}

export async function fetchContractDetail(id: number): Promise<ContractDetail> {
  let response: Response
  try {
    response = await apiFetch(`/contracts/${id}`, { signal: AbortSignal.timeout(15000) })
  } catch {
    throw new Error(i18n.global.t('contracts.errors.loadContractFailed'))
  }
  if (!response.ok) {
    throw new Error(i18n.global.t('contracts.errors.fetchContractFailed', { status: response.status }))
  }
  return response.json()
}

export async function updateContractAccounting1cMapping(
  id: number,
  input: { contractUid: string | null; contractorUid: string | null },
): Promise<ContractDetail> {
  const response = await apiFetch(`/contracts/${id}/accounting-1c-mapping`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? i18n.global.t('contracts.errors.mappingSaveFailed', { status: response.status }))
  }
  return response.json()
}

export async function createContract(input: CreateContractInput): Promise<{ id: number }> {
  const response = await apiFetch('/contracts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const body: { message?: string; fieldErrors?: Record<string, string> } = await response.json().catch(() => ({}))
    throw Object.assign(new Error(body.message ?? i18n.global.t('contracts.errors.createFailed', { status: response.status })), { fieldErrors: body.fieldErrors })
  }
  return response.json()
}

export async function terminateContract(id: number, actualEndDate: string): Promise<void> {
  const response = await apiFetch(`/contracts/${id}/terminate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actualEndDate }),
  })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? i18n.global.t('contracts.errors.terminateFailed', { status: response.status }))
  }
}

export async function deleteContract(id: number): Promise<void> {
  const response = await apiFetch(`/contracts/${id}`, { method: 'DELETE' })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? i18n.global.t('contracts.errors.deleteFailed', { status: response.status }))
  }
}

export async function fetchLegalRepPrefill(residentUid: string): Promise<LegalRepPrefill | null> {
  const response = await apiFetch(`/contracts/legal-rep/${residentUid}`)
  if (!response.ok) {
    throw new Error(i18n.global.t('contracts.errors.fetchLegalRepFailed', { status: response.status }))
  }
  return response.json()
}

export async function downloadContractDocument(id: number, contractNumber: string): Promise<void> {
  const response = await apiFetch(`/contracts/${id}/document`)
  if (!response.ok) {
    throw new Error(i18n.global.t('contracts.errors.documentFailed', { status: response.status }))
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `Договор №${contractNumber}.docx`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function printContractsBatch(ids: number[]): Promise<void> {
  const response = await apiFetch('/contracts/print-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? i18n.global.t('contracts.errors.batchDocumentFailed', { status: response.status }))
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'Договоры.zip'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function fetchContractDocumentPdf(id: number): Promise<Blob> {
  const response = await apiFetch(`/contracts/${id}/document/pdf`)
  if (!response.ok) {
    throw new Error(i18n.global.t('contracts.errors.documentFailed', { status: response.status }))
  }
  return response.blob()
}

export async function fetchContractsBatchPdf(ids: number[]): Promise<Blob> {
  const response = await apiFetch('/contracts/print-batch/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? i18n.global.t('contracts.errors.batchDocumentFailed', { status: response.status }))
  }
  return response.blob()
}
