import { apiFetch } from './api-base'

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
  contract: { id: number; number: string; residentFullName: string } | null
  openAccruals: OpenAccrualRow[]
  penaltyBalance: number
  acquiringAvailable: boolean
  history: PaymentIntentRow[]
}

export interface CreateIntentInput {
  accrualIds: number[]
  includePenalty: boolean
  customAmount: number | null
  payerIsResident: boolean
  representativeFullName: string | null
  payerEmail: string | null
  payerPhone: string | null
}

async function parseError(response: Response, fallback: string): Promise<never> {
  const body: { message?: string } = await response.json().catch(() => ({}))
  throw new Error(body.message ?? `${fallback} (${response.status})`)
}

export async function fetchMyPayments(): Promise<MyPaymentsData> {
  const response = await apiFetch('/my-payments')
  if (!response.ok) return parseError(response, 'Не удалось получить данные оплаты')
  return response.json()
}

export async function createPaymentIntent(input: CreateIntentInput): Promise<{ intentId: number; paymentPageUrl: string }> {
  const response = await apiFetch('/my-payments/intents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) return parseError(response, 'Не удалось начать оплату')
  return response.json()
}

export async function fetchPaymentIntent(id: number): Promise<PaymentIntentRow> {
  const response = await apiFetch(`/my-payments/intents/${id}`)
  if (!response.ok) return parseError(response, 'Не удалось получить статус платежа')
  return response.json()
}
