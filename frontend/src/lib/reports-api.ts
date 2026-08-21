import { apiFetch } from './api-base'
import { fetchListPage, fetchListFacets, type ListOptions, type ListPage, type FacetOption } from './list-api'
import type { ContractStatus } from './contracts-api'

export type { ListOptions, ListPage, FacetOption }

export interface DebtorRow {
  contractId: number
  contractNumber: string
  residentIndividualUid: string
  residentFullName: string
  room: string | null
  status: ContractStatus
  createdAt: string
  totalAccrued: number
  totalPaid: number
  principalDebt: number
  penaltyBalance: number
  totalBalance: number
}

export interface DebtorsSummary {
  debtorsCount: number
  totalAccrued: number
  totalDebt: number
  totalPenalty: number
  totalPaid: number
}

export interface DebtorBreakdownPeriod {
  id: number
  periodStart: string
  periodEnd: string
  dueDate: string
  adjustmentAmount: number
  adjustmentReason: string | null
  voidedAt: string | null
  total: number
  paid: number
  balance: number
}

export interface DebtorBreakdown {
  contractId: number
  contractNumber: string
  residentFullName: string
  room: string | null
  periods: DebtorBreakdownPeriod[]
  totalAccrued: number
  totalPaid: number
  // Пеня — единая сумма на договор, не по периодам (см. reports.controller.ts).
  penaltyBalance: number
  totalDebt: number
}

export interface PenaltyLogEntry {
  date: string
  amount: number
  overdueBase: number
}

export interface DebtorPenaltyLog {
  contractId: number
  contractNumber: string
  residentFullName: string
  room: string | null
  entries: PenaltyLogEntry[]
  total: number
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
  birthDate: string | null
  citizenship: string | null
  citizenshipGroup: 'RU' | 'FOREIGN'
  isOwnUniversity: 'OWN' | 'OTHER'
  movedInDate: string
}

export type ContractRegistryBucket = 'ACTIVE' | 'EXPIRING' | 'OVERDUE' | 'TERMINATED'

export interface ContractRegistryRow {
  contractId: number
  contractNumber: string
  residentIndividualUid: string
  residentFullName: string
  room: string | null
  createdAt: string
  startDate: string
  endDate: string
  actualEndDate: string | null
  daysUntilEnd: number
  bucket: ContractRegistryBucket
}

export interface ContractsRegistrySummary {
  active: number
  expiring30: number
  ended: number
}

export type MovementOperation = 'IN' | 'OUT' | 'MOVE'

export interface MovementEvent {
  date: string
  contractId: number
  contractNumber: string
  residentIndividualUid: string
  residentFullName: string
  operation: MovementOperation
  from: string | null
  to: string | null
}

export interface MovementsSummary {
  movedIn: number
  movedOut: number
  relocated: number
}

async function getJson<T>(path: string): Promise<T> {
  const response = await apiFetch(path)
  if (!response.ok) {
    throw new Error(`Не удалось получить отчёт (${response.status})`)
  }
  return response.json()
}

// --- Финансовый отчёт (бывшая "Задолженность") ---
export function fetchDebtorsPage(options: ListOptions, asOf: string): Promise<ListPage<DebtorRow>> {
  return fetchListPage<DebtorRow>('/reports/debtors', options, { asOf })
}
export function fetchDebtorsFacets(field: string): Promise<FacetOption[]> {
  return fetchListFacets('/reports/debtors', field)
}
export function fetchDebtorsSummary(asOf: string): Promise<DebtorsSummary> {
  return getJson(`/reports/debtors/summary?asOf=${asOf}`)
}
export function fetchDebtorBreakdown(contractId: number, asOf: string): Promise<DebtorBreakdown> {
  return getJson(`/reports/debtors/${contractId}/breakdown?asOf=${asOf}`)
}
export function fetchDebtorPenaltyLog(contractId: number, asOf: string): Promise<DebtorPenaltyLog> {
  return getJson(`/reports/debtors/${contractId}/penalty-log?asOf=${asOf}`)
}

export function fetchUpcomingPayments(days = 7): Promise<UpcomingPaymentRow[]> {
  return getJson(`/reports/upcoming-payments?days=${days}`)
}

// --- Занятость ---
export function fetchOccupancy(): Promise<OccupancyReport> {
  return getJson('/reports/occupancy')
}

// --- Реестр проживающих ---
export function fetchContingentPage(options: ListOptions, asOf: string): Promise<ListPage<ContingentRow>> {
  return fetchListPage<ContingentRow>('/reports/contingent', options, { asOf })
}
export function fetchContingentFacets(field: string): Promise<FacetOption[]> {
  return fetchListFacets('/reports/contingent', field)
}

// --- Реестр договоров ---
export function fetchContractsRegistryPage(options: ListOptions): Promise<ListPage<ContractRegistryRow>> {
  return fetchListPage<ContractRegistryRow>('/reports/contracts-registry', options)
}
export function fetchContractsRegistryFacets(field: string): Promise<FacetOption[]> {
  return fetchListFacets('/reports/contracts-registry', field)
}
export function fetchContractsRegistrySummary(): Promise<ContractsRegistrySummary> {
  return getJson('/reports/contracts-registry/summary')
}

// --- Заселение / выселение ---
export function fetchMovementsPage(options: ListOptions, from: string, to: string): Promise<ListPage<MovementEvent>> {
  return fetchListPage<MovementEvent>('/reports/movements', options, { from, to })
}
export function fetchMovementsFacets(field: string): Promise<FacetOption[]> {
  return fetchListFacets('/reports/movements', field)
}
export function fetchMovementsSummary(from: string, to: string): Promise<MovementsSummary> {
  const params = new URLSearchParams({ from, to })
  return getJson(`/reports/movements/summary?${params}`)
}
