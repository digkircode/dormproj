import { apiFetch } from './api-base'
import type { PaymentMethod, PaymentRow } from './contracts-api'
import { i18n } from '@/i18n'

export interface CreatePaymentInput {
  amount: number
  paidAt: string
  method: PaymentMethod
  rawComment?: string | null
}

export async function createPayment(contractId: number, input: CreatePaymentInput): Promise<PaymentRow> {
  const response = await apiFetch(`/contracts/${contractId}/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? i18n.global.t('contracts.errors.addPaymentFailed', { status: response.status }))
  }
  return response.json()
}

export async function reversePayment(paymentId: number): Promise<PaymentRow> {
  const response = await apiFetch(`/payments/${paymentId}/reverse`, { method: 'POST' })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? i18n.global.t('contracts.errors.reversePaymentFailed', { status: response.status }))
  }
  return response.json()
}

// Ручной повтор отправки в 1С Бухгалтерию (флоу 1) — только для платежей с сайта
// (source==='WEBSITE'), см. billing.controller.ts#syncPaymentToAccounting1c.
export async function syncPaymentToAccounting1c(paymentId: number): Promise<PaymentRow> {
  const response = await apiFetch(`/payments/${paymentId}/sync-to-1c`, { method: 'POST' })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? i18n.global.t('contracts.errors.syncPaymentToAccounting1cFailed', { status: response.status }))
  }
  return response.json()
}

// Ручной пересчёт пени (2026-09-05) — перестраивает журнал пени договора с нуля тем же
// дневным расчётом, что и ночной крон, см. billing.controller.ts#recalculatePenalty.
export interface RecalculatePenaltyResult {
  rowsCreated: number
  totalAdded: number
}

export async function recalculatePenalty(contractId: number): Promise<RecalculatePenaltyResult> {
  const response = await apiFetch(`/contracts/${contractId}/recalculate-penalty`, { method: 'POST' })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? i18n.global.t('contracts.errors.recalculatePenaltyFailed', { status: response.status }))
  }
  return response.json()
}
