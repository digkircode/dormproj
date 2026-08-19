import { apiFetch } from './api-base'
import { fetchListPage, fetchListFacets, type ListOptions, type ListPage, type FacetOption } from './list-api'

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
  penaltyAmount: number
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
  terms: ContractTerms[]
  accruals: AccrualRow[]
  payments: PaymentRow[]
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
  legalRepName?: string | null
  legalRepPhone?: string | null
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

export function fetchContractsPage(options: FetchContractsOptions): Promise<ContractsPage> {
  return fetchListPage<ContractListItem>('/contracts', options)
}

export function fetchContractFacets(field: string): Promise<FacetOption[]> {
  return fetchListFacets('/contracts', field)
}

export async function fetchContractDetail(id: number): Promise<ContractDetail> {
  const response = await apiFetch(`/contracts/${id}`)
  if (!response.ok) {
    throw new Error(`Не удалось получить данные договора (${response.status})`)
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
    throw new Error(body.message ?? `Не удалось создать договор (${response.status})`)
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
    throw new Error(body.message ?? `Не удалось расторгнуть договор (${response.status})`)
  }
}
