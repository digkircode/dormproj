import { apiFetch } from './api-base'
import { fetchListPage, fetchListFacets, type ListOptions, type ListPage, type FacetOption } from './list-api'
import type { PaymentMethod, PaymentRow } from './contracts-api'
import { i18n } from '@/i18n'

export type PaymentImportStatus = 'MATCHED' | 'NEEDS_REVIEW'

export interface PaymentImportSuggestedContract {
  id: number
  number: string
  residentFullName: string
}

// Все договоры опознанного контрагента (не только предложенный) — если их больше
// одного, показывается выпадающий список вместо одной "чипы" (см. промпт проекта).
export interface PaymentImportCandidateContract {
  id: number
  number: string
  contractDate: string
  status: string
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

// Флоу 1 — наши WEBSITE-платежи (эквайринг) со статусом отправки в 1С. Показываются на
// том же экране, что и очередь одобрения из 1С (флоу 2) — по прямой просьбе 2026-09-03,
// один общий обзор вместо двух разрозненных мест. Без пагинации на бэке — см.
// payment-imports.controller.ts#websitePayments.
export interface WebsitePaymentRow {
  id: number
  paidAt: string
  amount: number
  contractorFio: string
  contract: { id: number; number: string }
  purpose: string
  accounting1cSyncStatus: Accounting1cSyncStatus
  accounting1cDocumentUid: string | null
  accounting1cSyncError: string | null
  accounting1cSyncedAt: string | null
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

// Сумма и дата — только из 1С, сотрудник их не правит (по прямой просьбе 2026-09-03).
export interface ApprovePaymentImportInput {
  contractId: number
  method: PaymentMethod
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
