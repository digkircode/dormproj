import { apiFetch } from './api-base'
import type { PaymentMethod, PaymentRow } from './contracts-api'

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
    throw new Error(body.message ?? `Не удалось внести платёж (${response.status})`)
  }
  return response.json()
}

export async function reversePayment(paymentId: number): Promise<PaymentRow> {
  const response = await apiFetch(`/payments/${paymentId}/reverse`, { method: 'POST' })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? `Не удалось сторнировать платёж (${response.status})`)
  }
  return response.json()
}
