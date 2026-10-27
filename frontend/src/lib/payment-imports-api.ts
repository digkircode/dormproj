import { apiFetch } from './api-base'
import { fetchListPage, fetchListFacets, type ListOptions, type ListPage, type FacetOption } from './list-api'
import type { PaymentRow } from './contracts-api'
import { i18n } from '@/i18n'

export type PaymentImportStatus = 'MATCHED' | 'NEEDS_REVIEW' | 'REVERSED'

export interface PaymentImportSuggestedContract {
  id: number
  number: string
  residentFullName: string
  residentIndividualUid: string
}

export interface PaymentImportCandidateContract {
  id: number
  number: string
  contractDate: string
  status: string
}

export interface PaymentImportRow {
  id: number
  resultingPaymentId: number | null
  type: string | null
  reversedAt: string | null
  status: PaymentImportStatus
  externalId: string
  importedAt: string
  amount: number | null
  paidAt: string | null
  contractorFio: string | null
  comment: string | null
  suggestedContract: PaymentImportSuggestedContract | null
  matchedContract: { id: number; number: string; residentIndividualUid: string } | null
}

export interface PaymentImportDetail extends Omit<PaymentImportRow, 'suggestedContract'> {
  rawPayload: unknown
  candidate: {
    externalId: string
    contractorUid: string | null
    contractUid: string | null
    contractorFio: string | null
    contractName: string | null
    amount: number | null
    paidAt: string | null
    comment: string | null
    type: string | null
  }
  suggestedContract: PaymentImportSuggestedContract | null
  candidateContracts: PaymentImportCandidateContract[]
}

export type PaymentImportsPage = ListPage<PaymentImportRow>
export type { FacetOption }

export function fetchPaymentImportsPage(options: ListOptions, signal?: AbortSignal): Promise<PaymentImportsPage> {
  return fetchListPage<PaymentImportRow>('/payment-imports', options, undefined, signal)
}

export function fetchPaymentImportsFacets(field: string): Promise<FacetOption[]> {
  return fetchListFacets('/payment-imports', field)
}

export type Accounting1cSyncStatus = 'NOT_SYNCED' | 'SYNCED' | 'FAILED'

export interface WebsitePaymentRow {
  id: number
  paidAt: string
  amount: number
  contractorFio: string
  contract: { id: number; number: string; residentIndividualUid: string }
  purpose: string
  accounting1cSyncStatus: Accounting1cSyncStatus
  accounting1cDocumentUid: string | null
  accounting1cSyncError: string | null
  accounting1cSyncedAt: string | null
  reversedAt: string | null
}

export async function fetchWebsitePayments(): Promise<WebsitePaymentRow[]> {
  const response = await apiFetch('/payment-imports/website-payments')
  if (!response.ok) {
    throw new Error(i18n.global.t('paymentImports.errors.fetchListFailed', { status: response.status }))
  }
  return response.json()
}

export async function fetchPaymentImportDetail(id: number): Promise<PaymentImportDetail> {
  const response = await apiFetch(`/payment-imports/${id}`)
  if (!response.ok) {
    throw new Error(i18n.global.t('paymentImports.errors.fetchDetailFailed', { status: response.status }))
  }
  return response.json()
}


export async function approvePaymentImport(id: number): Promise<{ record: PaymentImportRow; payment: PaymentRow }> {
  const response = await apiFetch(`/payment-imports/${id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? i18n.global.t('paymentImports.errors.approveFailed', { status: response.status }))
  }
  return response.json()
}
