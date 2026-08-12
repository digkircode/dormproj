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

// Бэкенд всегда на порту 3000 того же хоста, что и фронт (см. docker-compose) —
// поэтому проще вычислить адрес во время выполнения, чем городить build-time env var.
function apiUrl(path: string): string {
  return `${window.location.protocol}//${window.location.hostname}:3000${path}`
}

export async function fetchStudentSyncLogs(): Promise<SyncLogEntry[]> {
  const response = await fetch(apiUrl('/sync/students/logs'))
  if (!response.ok) {
    throw new Error(`Не удалось получить логи синхронизации (${response.status})`)
  }
  return response.json()
}

export type TriggerSyncResult =
  | { ok: true }
  | { ok: false; conflict: boolean; message: string }

export async function triggerStudentSync(): Promise<TriggerSyncResult> {
  const response = await fetch(apiUrl('/sync/students'), { method: 'POST' })
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
