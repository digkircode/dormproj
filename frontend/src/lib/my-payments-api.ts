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
  contract: { id: number; number: string; residentFullName: string; roomNumber: string | null } | null
  openAccruals: OpenAccrualRow[]
  penaltyBalance: number
  acquiringAvailable: boolean
  history: PaymentIntentRow[]
  // Email из Individual.email (правится этой же формой) или, если там пусто, из
  // самой актуальной ContactInfo — см. resolveResidentEmail в my-payments.controller.ts.
  payerEmail: string | null
}

// Объединённая история платежей на карточке договора у резидента (вкладка "Платежи",
// см. MyContract.vue) — реальный леджер (Payment, в т.ч. внесённые сотрудником вручную и
// уже успешно проведённые онлайн-платежи) плюс попытки онлайн-оплаты, которые деньгами
// не закончились (FAILED/PENDING_BANK/CREATED/CANCELED/EXPIRED у PaymentIntent). SUCCEEDED
// intent НЕ включается отдельной строкой — его деньги уже видны как леджерный PAID (иначе
// был бы задвоенный платёж), см. сборку в MyContract.vue. Добавлено 2026-08-26 по прямой
// просьбе — раньше вкладка показывала только PaymentIntent и не видела оплаты сотрудников.
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

export const UNIFIED_PAYMENT_STATUS_LABELS: Record<UnifiedPaymentStatus, string> = {
  PAID: 'Оплачено',
  REVERSED: 'Сторнировано',
  CREATED: 'Создан',
  PENDING_BANK: 'Обрабатывается банком',
  FAILED: 'Не удалось',
  CANCELED: 'Отменено',
  EXPIRED: 'Истёк',
}

export interface CreateIntentInput {
  contractId?: number | null
  accrualIds: number[]
  includePenalty: boolean
  customAmount: number | null
  payerIsResident: boolean
  representativeFullName: string | null
  payerEmail: string
}

async function parseError(response: Response, fallback: string): Promise<never> {
  const body: { message?: string } = await response.json().catch(() => ({}))
  throw new Error(body.message ?? `${fallback} (${response.status})`)
}

// contractId — явный выбор из переключателя договоров (см. contracts-api.ts#fetchMyContracts);
// без него бэкенд берёт самый свежий.
export async function fetchMyPayments(contractId?: number): Promise<MyPaymentsData> {
  const response = await apiFetch(contractId ? `/my-payments?contractId=${contractId}` : '/my-payments')
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
