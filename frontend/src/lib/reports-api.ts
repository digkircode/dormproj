import { apiFetch } from './api-base'
import { fetchListPage, fetchListFacets, type ListOptions, type ListPage, type FacetOption } from './list-api'
import type { ContractStatus } from './contracts-api'
import { i18n } from '@/i18n'

export type { ListOptions, ListPage, FacetOption }

export interface DebtorRow {
  contractId: number
  contractNumber: string
  residentIndividualUid: string
  residentFullName: string
  room: string | null
  status: ContractStatus
  createdAt: string
  endDate: string
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

export type MovementOperation = 'IN' | 'OUT' | 'MOVE' | 'RENEWAL'

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
  renewed: number
}

async function getJson<T>(path: string): Promise<T> {
  const response = await apiFetch(path)
  if (!response.ok) {
    throw new Error(i18n.global.t('reports.errors.fetchFailed', { status: response.status }))
  }
  return response.json()
}

// Скачивание .xlsx — тот же приём, что downloadContractDocument в contracts-api.ts:
// apiFetch не подходит для обычной ссылки (нужна кука авторизации), поэтому сами
// получаем blob и эмулируем клик по <a download>. Экспорт учитывает только "на дату"/
// период отчёта (то, что видит и сама эта страница вне EntityTable) — поиск/сортировку/
// фильтры колонок EntityTable намеренно не пробрасывает наружу, см. EntityTable.vue.
async function downloadFile(path: string, filename: string): Promise<void> {
  const response = await apiFetch(path)
  if (!response.ok) {
    throw new Error(i18n.global.t('reports.errors.exportFailed', { status: response.status }))
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

// --- Финансовый отчёт (бывшая "Задолженность") ---
export function fetchDebtorsPage(options: ListOptions, asOf: string, signal?: AbortSignal): Promise<ListPage<DebtorRow>> {
  return fetchListPage<DebtorRow>('/reports/debtors', options, { asOf }, signal)
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
export function exportDebtorsExcel(asOf: string): Promise<void> {
  return downloadFile(`/reports/debtors/export?asOf=${asOf}`, `Финансовый отчёт на ${asOf}.xlsx`)
}

export function fetchUpcomingPayments(days = 7): Promise<UpcomingPaymentRow[]> {
  return getJson(`/reports/upcoming-payments?days=${days}`)
}

// --- Занятость ---
export function fetchOccupancy(): Promise<OccupancyReport> {
  return getJson('/reports/occupancy')
}

// --- Реестр проживающих ---
export function fetchContingentPage(options: ListOptions, asOf: string, signal?: AbortSignal): Promise<ListPage<ContingentRow>> {
  return fetchListPage<ContingentRow>('/reports/contingent', options, { asOf }, signal)
}
export function fetchContingentFacets(field: string): Promise<FacetOption[]> {
  return fetchListFacets('/reports/contingent', field)
}
export function exportContingentExcel(asOf: string): Promise<void> {
  return downloadFile(`/reports/contingent/export?asOf=${asOf}`, `Реестр проживающих на ${asOf}.xlsx`)
}

// --- Реестр договоров ---
export function fetchContractsRegistryPage(options: ListOptions, signal?: AbortSignal): Promise<ListPage<ContractRegistryRow>> {
  return fetchListPage<ContractRegistryRow>('/reports/contracts-registry', options, undefined, signal)
}
export function fetchContractsRegistryFacets(field: string): Promise<FacetOption[]> {
  return fetchListFacets('/reports/contracts-registry', field)
}
export function fetchContractsRegistrySummary(): Promise<ContractsRegistrySummary> {
  return getJson('/reports/contracts-registry/summary')
}
export function exportContractsRegistryExcel(): Promise<void> {
  return downloadFile('/reports/contracts-registry/export', 'Реестр договоров.xlsx')
}

// --- Заселение / выселение ---
export function fetchMovementsPage(options: ListOptions, from: string, to: string, signal?: AbortSignal): Promise<ListPage<MovementEvent>> {
  return fetchListPage<MovementEvent>('/reports/movements', options, { from, to }, signal)
}
export function fetchMovementsFacets(field: string): Promise<FacetOption[]> {
  return fetchListFacets('/reports/movements', field)
}
export function fetchMovementsSummary(from: string, to: string): Promise<MovementsSummary> {
  const params = new URLSearchParams({ from, to })
  return getJson(`/reports/movements/summary?${params}`)
}
export function exportMovementsExcel(from: string, to: string): Promise<void> {
  const params = new URLSearchParams({ to, ...(from ? { from } : {}) })
  return downloadFile(`/reports/movements/export?${params}`, 'Движение проживающих.xlsx')
}
