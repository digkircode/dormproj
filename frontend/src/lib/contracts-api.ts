import { apiFetch } from './api-base'

export type ContractStatus = 'ACTIVE' | 'TERMINATED' | 'EXPIRED'
export type DailyRateCategory = 'OWN_UNIVERSITY' | 'OTHER_UNIVERSITY'
export type PaymentMethod = 'CASH' | 'CARD_ACQUIRING' | 'BANK_TRANSFER' | 'MAT_CAPITAL' | 'WEBSITE'

export interface ContractListItem {
  id: number
  number: string
  status: ContractStatus
  startDate: string
  endDate: string
  actualEndDate: string | null
  residentFullName: string
  room: string | null
}

export interface ContractsPage {
  data: ContractListItem[]
  total: number
  page: number
  pageSize: number
}

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
  residentFullName: string
  residentIndividualUid: string
  currentRoom: { id: number; room: string } | null
  legalRepName: string | null
  legalRepPhone: string | null
  legalRepPassportSeries: string | null
  legalRepPassportNumber: string | null
  legalRepPassportIssuedBy: string | null
  legalRepPassportIssuedAt: string | null
  legalRepAddress: string | null
  matCapitalCoveredFrom: string | null
  matCapitalCoveredTo: string | null
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
  legalRepPassportSeries?: string | null
  legalRepPassportNumber?: string | null
  legalRepPassportIssuedBy?: string | null
  legalRepPassportIssuedAt?: string | null
  legalRepAddress?: string | null
  matCapitalCoveredFrom?: string | null
  matCapitalCoveredTo?: string | null
  matCapitalDeferredUntil?: string | null
}

export async function fetchContracts(params: { page: number; pageSize: number; search?: string; status?: string }): Promise<ContractsPage> {
  const query = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize) })
  if (params.search) query.set('search', params.search)
  if (params.status) query.set('status', params.status)
  const response = await apiFetch(`/contracts?${query}`)
  if (!response.ok) {
    throw new Error(`Не удалось получить список договоров (${response.status})`)
  }
  return response.json()
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
