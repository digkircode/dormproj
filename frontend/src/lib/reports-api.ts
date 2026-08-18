import { apiFetch } from './api-base'

export type AgingBucket = 'CURRENT' | 'D1_30' | 'D31_60' | 'D61_90' | 'D90_PLUS'

export interface DebtorRow {
  contractId: number
  contractNumber: string
  residentFullName: string
  room: string | null
  principalBalance: number
  penaltyBalance: number
  totalBalance: number
  daysOverdue: number
  agingBucket: AgingBucket
}

export interface CurrentResidentRow {
  contractId: number
  contractNumber: string
  contractStatus: string
  residentFullName: string
  room: string
  fromDate: string
}

export interface UpcomingPaymentRow {
  contractId: number
  contractNumber: string
  residentFullName: string
  dueDate: string
  balance: number
}

async function getJson<T>(path: string): Promise<T> {
  const response = await apiFetch(path)
  if (!response.ok) {
    throw new Error(`Не удалось получить отчёт (${response.status})`)
  }
  return response.json()
}

export function fetchDebtors(): Promise<DebtorRow[]> {
  return getJson('/reports/debtors')
}

export function fetchCurrentResidents(): Promise<CurrentResidentRow[]> {
  return getJson('/reports/current-residents')
}

export function fetchUpcomingPayments(days = 7): Promise<UpcomingPaymentRow[]> {
  return getJson(`/reports/upcoming-payments?days=${days}`)
}
