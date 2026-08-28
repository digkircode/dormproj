import { apiFetch } from './api-base'
import { fetchListPage, fetchListFacets, type ListOptions, type ListPage, type FacetOption } from './list-api'
import { i18n } from '@/i18n'

export type ContractStatus = 'ACTIVE' | 'TERMINATED' | 'EXPIRED'
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
  residentFullName: string
  room: string | null
  roomId: number | null
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
  balance: number
}

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
  // Пеня — единая сумма на договор (не по начислениям), penaltyBalance — сколько из неё
  // ещё не покрыто платежами (см. contracts.controller.ts/penalty-balance.ts).
  penaltyAmount: number
  penaltyPaid: number
  penaltyBalance: number
  terms: ContractTerms[]
  accruals: AccrualRow[]
  payments: PaymentRow[]
  // Определяет доступность "Удалить договор" — после первой же оплаты (даже
  // сторнированной) удаление блокируется навсегда, см. contracts.controller.ts.
  hasPayments: boolean
}

// Договор самого проживающего (GET /my-contract, RESIDENT-only, без :id в маршруте —
// см. backend/src/contracts/my-contract.controller.ts) — заметно уже ContractDetail:
// без legalRep*/matCapital (административные поля не для этого вида) и без hasPayments
// (странице резидента не нужны кнопки удаления/печати/платежей).
// Одна строка журнала начисления пени за конкретный день (см. GET /my-contract) — для
// раскрытия тайла "Пени" на карточке договора резидента (MyContract.vue): amount = overdueBase * 0.14%/день.
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
  currentRoom: { id: number; room: string } | null
  penaltyAmount: number
  penaltyPaid: number
  penaltyBalance: number
  penaltyLog: PenaltyLogRow[]
  terms: ContractTerms[]
  accruals: AccrualRow[]
  payments: PaymentRow[]
}

// null — у резидента вообще нет ни одного договора (не ошибка, штатный случай — страница
// показывает соответствующее сообщение, см. MyContract.vue). contractId — явный выбор из
// переключателя договоров (см. fetchMyContracts ниже, добавлено 2026-08-25 под поддержку
// нескольких одновременных договоров на одного человека); без него — самый свежий.
export async function fetchMyContract(contractId?: number): Promise<MyContractDetail | null> {
  const response = await apiFetch(contractId ? `/my-contract?contractId=${contractId}` : '/my-contract')
  if (!response.ok) {
    throw new Error(i18n.global.t('contracts.errors.fetchContractFailed', { status: response.status }))
  }
  const data: { contract: MyContractDetail | null } = await response.json()
  return data.contract
}

// Краткая сводка по ВСЕМ договорам резидента (не только самому свежему) — питает
// переключатель на карточке договора и в модалке оплаты, см. GET /my-contract/list.
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
  const response = await apiFetch(`/contracts/${id}`)
  if (!response.ok) {
    throw new Error(i18n.global.t('contracts.errors.fetchContractFailed', { status: response.status }))
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
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? i18n.global.t('contracts.errors.createFailed', { status: response.status }))
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

// Последний договор этого резидента с уже заведённым родителем (см. legal-rep/:residentUid
// в contracts.controller.ts) — для автоподстановки в форму нового договора. null, если
// у этого несовершеннолетнего родитель ещё ни разу не вводился.
export async function fetchLegalRepPrefill(residentUid: string): Promise<LegalRepPrefill | null> {
  const response = await apiFetch(`/contracts/legal-rep/${residentUid}`)
  if (!response.ok) {
    throw new Error(i18n.global.t('contracts.errors.fetchLegalRepFailed', { status: response.status }))
  }
  return response.json()
}

// Скачивание заполненного .docx — apiFetch не подходит для обычной ссылки (нужна кука
// авторизации), поэтому сами получаем blob и эмулируем клик по <a download>.
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

// Массовая печать — ZIP с отдельным .docx на каждый выбранный договор (тот же бланк,
// что и у printContractDocument, см. contracts.controller.ts#printBatch), не единый файл.
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
