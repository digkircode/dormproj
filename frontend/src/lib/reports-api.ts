import { apiFetch } from './api-base'
import { fetchListPage, fetchListFacets, type ListOptions, type ListPage, type FacetOption } from './list-api'

export type { ListOptions, ListPage, FacetOption }

export type AgingBucket = 'CURRENT' | 'D1_30' | 'D31_60' | 'D61_90' | 'D90_PLUS'

export interface DebtorRow {
  contractId: number
  contractNumber: string
  residentIndividualUid: string
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

export interface DebtorsSummary {
  debtorsCount: number
  totalDebt: number
  overdueDebt: number
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
  birthDate: string | null
  citizenship: string | null
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

// --- Задолженность ---
export function fetchDebtorsPage(options: ListOptions): Promise<ListPage<DebtorRow>> {
  return fetchListPage<DebtorRow>('/reports/debtors', options)
}
export function fetchDebtorsFacets(field: string): Promise<FacetOption[]> {
  return fetchListFacets('/reports/debtors', field)
}
export function fetchDebtorsSummary(): Promise<DebtorsSummary> {
  return getJson('/reports/debtors/summary')
}
export function fetchDebtorBreakdown(contractId: number): Promise<DebtorBreakdown> {
  return getJson(`/reports/debtors/${contractId}/breakdown`)
}

export function fetchUpcomingPayments(days = 7): Promise<UpcomingPaymentRow[]> {
  return getJson(`/reports/upcoming-payments?days=${days}`)
}

// --- Занятость ---
export function fetchOccupancy(): Promise<OccupancyReport> {
  return getJson('/reports/occupancy')
}

// --- Реестр проживающих ---
export function fetchContingentPage(options: ListOptions): Promise<ListPage<ContingentRow>> {
  return fetchListPage<ContingentRow>('/reports/contingent', options)
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
// Не через fetchListPage — у неё basePath без своих query-параметров (from/to
// добавлялись бы вторым "?" и ломали URL), поэтому здесь тот же набор параметров
// собирается вручную в один URLSearchParams.
export async function fetchMovementsPage(options: ListOptions, from: string, to: string): Promise<ListPage<MovementEvent>> {
  const params = new URLSearchParams({
    page: String(options.page),
    pageSize: String(options.pageSize),
    sortBy: options.sortBy,
    sortDir: options.sortDir,
    from,
    to,
  })
  if (options.search) params.set('search', options.search)
  const activeFilters = Object.fromEntries(Object.entries(options.filters).filter(([, values]) => values.length > 0))
  if (Object.keys(activeFilters).length > 0) params.set('filters', JSON.stringify(activeFilters))

  const response = await apiFetch(`/reports/movements?${params}`)
  if (!response.ok) {
    throw new Error(`Не удалось получить данные (${response.status})`)
  }
  return response.json()
}
export function fetchMovementsFacets(field: string): Promise<FacetOption[]> {
  return fetchListFacets('/reports/movements', field)
}
export function fetchMovementsSummary(from: string, to: string): Promise<MovementsSummary> {
  const params = new URLSearchParams({ from, to })
  return getJson(`/reports/movements/summary?${params}`)
}
