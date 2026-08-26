import { apiFetch } from './api-base'
import { fetchListPage, fetchListFacets, type ListOptions, type ListPage, type FacetOption } from './list-api'
import { i18n } from '@/i18n'

export interface SyncLogEntry {
  id: number
  rowNumber: number
  type: string
  trigger: 'CRON' | 'MANUAL'
  status: 'RUNNING' | 'SUCCESS' | 'FAILED'
  startedAt: string
  finishedAt: string | null
  fetchedCount: number | null
  added: number | null
  updated: number | null
  removed: number | null
  errorMessage: string | null
  errorStack: string | null
  targetUid: string | null
  // Разбивка по шагам (студент/физлицо/гражданство/паспорт/контакты) — только у
  // точечной синхронизации физлица и только при успехе, у остальных 5 типов — null.
  details: Record<
    string,
    { fetchedCount: number; added: number; updated?: number; removed?: number; records: unknown[] }
  > | null
}

export type SyncLogsPage = ListPage<SyncLogEntry>
export type { FacetOption }

export function fetchSyncLogsPage(basePath: string, options: ListOptions): Promise<SyncLogsPage> {
  return fetchListPage<SyncLogEntry>(`${basePath}/logs`, options)
}

export function fetchSyncLogFacets(basePath: string, field: string): Promise<FacetOption[]> {
  return fetchListFacets(`${basePath}/logs`, field)
}

// Обзорная таблица на /sync (Sync.vue/useSyncRow.ts) хочет только самый последний лог
// для статуса/времени/длительности строки — не переиспользует полный список логов,
// просто просит первую страницу по 1 записи в убывающем порядке у того же эндпоинта.
export async function fetchSyncLogs(basePath: string): Promise<SyncLogEntry[]> {
  const page = await fetchSyncLogsPage(basePath, {
    page: 1,
    pageSize: 1,
    search: '',
    sortBy: 'startedAt',
    sortDir: 'desc',
    filters: {},
  })
  return page.data
}

export type TriggerSyncResult =
  | { ok: true }
  | { ok: false; conflict: boolean; message: string }

export async function triggerSync(basePath: string): Promise<TriggerSyncResult> {
  const response = await apiFetch(basePath, { method: 'POST' })
  if (response.ok) {
    return { ok: true }
  }
  const body: { message?: string } = await response.json().catch(() => ({}))
  return {
    ok: false,
    conflict: response.status === 409,
    message: body.message ?? i18n.global.t('sync.errors.triggerFailed', { status: response.status }),
  }
}
