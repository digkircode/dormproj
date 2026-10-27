import { apiFetch } from './api-base'
import { i18n } from '@/i18n'

export type PaymentIntentStatus = 'CREATED' | 'PENDING_BANK' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'EXPIRED'

export interface OpenAccrualRow {
  id: number
  periodStart: string
  periodEnd: string
  balance: number
}

export interface PaymentIntentRow {
  id: number
  amount: number
  status: PaymentIntentStatus
  description: string
  createdAt: string
  fiscalStatus: string | null
  fiscalReceiptUrl: string | null
  failureReason: string | null
}

export interface MyPaymentsData {
  contract: { id: number; number: string; residentFullName: string; roomNumber: string | null } | null
  openAccruals: OpenAccrualRow[]
  penaltyBalance: number
  acquiringAvailable: boolean
  history: PaymentIntentRow[]
  payerEmail: string | null
}

export type UnifiedPaymentStatus = 'PAID' | 'REVERSED' | Exclude<PaymentIntentStatus, 'SUCCEEDED'>

export interface UnifiedPaymentRow {
  id: string
  date: string
  description: string
  amount: number
  status: UnifiedPaymentStatus
  showReceiptButton: boolean
  fiscalReceiptUrl: string | null
}

export const UNIFIED_PAYMENT_STATUS_LABELS: Record<UnifiedPaymentStatus, string> = new Proxy(
  {} as Record<UnifiedPaymentStatus, string>,
  { get: (_target, status: string) => i18n.global.t(`payment.status.${status}`) },
)

export interface CreateIntentInput {
  contractId?: number | null
  accrualIds: number[]
  includePenalty: boolean
  payerIsResident: boolean
  representativeFullName: string | null
  payerEmail: string
}

async function parseError(response: Response, fallbackKey: string): Promise<never> {
  const body: { message?: string } = await response.json().catch(() => ({}))
  throw new Error(body.message ?? i18n.global.t(fallbackKey, { status: response.status }))
}

export async function fetchMyPayments(contractId?: number): Promise<MyPaymentsData> {
  const response = await apiFetch(contractId ? `/my-payments?contractId=${contractId}` : '/my-payments')
  if (!response.ok) return parseError(response, 'payment.errors.fetchPaymentDataFailed')
  return response.json()
}

export async function createPaymentIntent(input: CreateIntentInput): Promise<{ intentId: number; paymentPageUrl: string }> {
  const response = await apiFetch('/my-payments/intents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) return parseError(response, 'payment.errors.startPaymentFailed')
  return response.json()
}

export async function fetchPaymentIntent(id: number): Promise<PaymentIntentRow> {
  const response = await apiFetch(`/my-payments/intents/${id}`)
  if (!response.ok) return parseError(response, 'payment.errors.fetchPaymentStatusFailed')
  return response.json()
}
