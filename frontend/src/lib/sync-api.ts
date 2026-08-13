import { apiFetch } from './api-base'

export interface SyncLogEntry {
  id: number
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
}

export async function fetchSyncLogs(basePath: string): Promise<SyncLogEntry[]> {
  const response = await apiFetch(`${basePath}/logs`)
  if (!response.ok) {
    throw new Error(`Не удалось получить логи синхронизации (${response.status})`)
  }
  return response.json()
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
    message: body.message ?? `Не удалось запустить синхронизацию (${response.status})`,
  }
}
