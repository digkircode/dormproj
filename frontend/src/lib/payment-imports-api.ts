import { apiFetch } from './api-base'
import { fetchListPage, fetchListFacets, type ListOptions, type ListPage, type FacetOption } from './list-api'
import type { PaymentMethod, PaymentRow } from './contracts-api'
import { i18n } from '@/i18n'

export type PaymentImportStatus = 'IMPORTED' | 'MATCHED' | 'NEEDS_REVIEW' | 'REJECTED'

export interface PaymentImportSuggestedContract {
  id: number
  number: string
  residentFullName: string
}

export interface PaymentImportRow {
  id: number
  status: PaymentImportStatus
  externalId: string
  importedAt: string
  amount: number | null
  paidAt: string | null
  contractorFio: string | null
  comment: string | null
  suggestedContract: PaymentImportSuggestedContract | null
  matchedContract: { id: number; number: string } | null
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
  }
  suggestedContract: PaymentImportSuggestedContract | null
}

export type PaymentImportsPage = ListPage<PaymentImportRow>
export type { FacetOption }

export function fetchPaymentImportsPage(options: ListOptions, signal?: AbortSignal): Promise<PaymentImportsPage> {
  return fetchListPage<PaymentImportRow>('/payment-imports', options, undefined, signal)
}

export function fetchPaymentImportsFacets(field: string): Promise<FacetOption[]> {
  return fetchListFacets('/payment-imports', field)
}

export async function fetchPaymentImportDetail(id: number): Promise<PaymentImportDetail> {
  const response = await apiFetch(`/payment-imports/${id}`)
  if (!response.ok) {
    throw new Error(i18n.global.t('paymentImports.errors.fetchDetailFailed', { status: response.status }))
  }
  return response.json()
}

export interface ApprovePaymentImportInput {
  contractId: number
  method: PaymentMethod
  amount?: number
  paidAt?: string
}

export async function approvePaymentImport(id: number, input: ApprovePaymentImportInput): Promise<{ record: PaymentImportRow; payment: PaymentRow }> {
  const response = await apiFetch(`/payment-imports/${id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? i18n.global.t('paymentImports.errors.approveFailed', { status: response.status }))
  }
  return response.json()
}

export async function rejectPaymentImport(id: number, reason?: string): Promise<PaymentImportRow> {
  const response = await apiFetch(`/payment-imports/${id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: reason?.trim() || null }),
  })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? i18n.global.t('paymentImports.errors.rejectFailed', { status: response.status }))
  }
  return response.json()
}
