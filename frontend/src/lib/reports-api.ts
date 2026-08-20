import { apiFetch } from './api-base'

export type AgingBucket = 'CURRENT' | 'D1_30' | 'D31_60' | 'D61_90' | 'D90_PLUS'

export interface DebtorRow {
  contractId: number
  contractNumber: string
  residentFullName: string
  room: string | null
  totalAccrued: number
  totalPaid: number
  principalBalance: number
  penaltyBalance: number
  totalBalance: number
  daysOverdue: number
  agingBucket: AgingBucket
}

export interface DebtorBreakdownPeriod {
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
  daysOverdue: number
}

export interface DebtorBreakdown {
  contractId: number
  contractNumber: string
  residentFullName: string
  room: string | null
  periods: DebtorBreakdownPeriod[]
  totalDebt: number
}

export interface UpcomingPaymentRow {
  contractId: number
  contractNumber: string
  residentFullName: string
  dueDate: string
  balance: number
}

export interface OccupancyRoom {
  id: number
  room: string
  floor: number | null
  capacity: number | null
  occupied: number
  free: number | null
  occupants: { contractId: number; contractNumber: string; residentFullName: string }[]
}

export interface OccupancyReport {
  totalPlaces: number
  occupied: number
  free: number
  occupancyRate: number
  floors: { floor: number | null; rooms: OccupancyRoom[] }[]
}

export interface ContingentRow {
  contractId: number
  contractNumber: string
  residentIndividualUid: string
  residentFullName: string
  room: string
  facultet: string | null
  kursNumber: number | null
  movedInDate: string
}

export type ContractRegistryBucket = 'ACTIVE' | 'EXPIRING' | 'OVERDUE' | 'TERMINATED'

export interface ContractRegistryRow {
  contractId: number
  contractNumber: string
  residentFullName: string
  room: string | null
  startDate: string
  endDate: string
  actualEndDate: string | null
  daysUntilEnd: number
  bucket: ContractRegistryBucket
}

export interface ContractRegistryReport {
  summary: { active: number; expiring30: number; ended: number }
  contracts: ContractRegistryRow[]
}

export type MovementOperation = 'IN' | 'OUT' | 'MOVE'

export interface MovementEvent {
  date: string
  contractId: number
  contractNumber: string
  residentFullName: string
  operation: MovementOperation
  from: string | null
  to: string | null
}

export interface MovementsReport {
  summary: { movedIn: number; movedOut: number; relocated: number }
  events: MovementEvent[]
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

export function fetchDebtorBreakdown(contractId: number): Promise<DebtorBreakdown> {
  return getJson(`/reports/debtors/${contractId}/breakdown`)
}

export function fetchUpcomingPayments(days = 7): Promise<UpcomingPaymentRow[]> {
  return getJson(`/reports/upcoming-payments?days=${days}`)
}

export function fetchOccupancy(): Promise<OccupancyReport> {
  return getJson('/reports/occupancy')
}

export function fetchContingent(): Promise<ContingentRow[]> {
  return getJson('/reports/contingent')
}

export function fetchContractsRegistry(): Promise<ContractRegistryReport> {
  return getJson('/reports/contracts-registry')
}

export function fetchMovements(from?: string, to?: string): Promise<MovementsReport> {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  const qs = params.toString()
  return getJson(`/reports/movements${qs ? `?${qs}` : ''}`)
}
