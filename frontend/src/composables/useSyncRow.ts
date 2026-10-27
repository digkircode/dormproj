import { computed, ref } from 'vue'
import { i18n } from '@/i18n'
import { fetchSyncLogs, triggerSync, type SyncLogEntry } from '@/lib/sync-api'
import { formatDateTime, formatDuration, type SyncStatusKey } from '@/lib/sync-format'

const POLL_INTERVAL_MS = 3000
const MAX_POLL_MS = 3 * 60 * 1000

export function useSyncRow(nameKey: string, basePath: string) {
  const latestLog = ref<SyncLogEntry | null>(null)
  const isRunning = ref(false)

  const row = computed(() => {
    const log = latestLog.value
    const status: SyncStatusKey = isRunning.value ? 'RUNNING' : log ? log.status : 'NONE'
    return {
      name: i18n.global.t(nameKey),
      status,
      time: log ? formatDateTime(log.startedAt) : '-',
      duration: log ? formatDuration(log.startedAt, log.finishedAt) : '-',
      startedAtRaw: log?.startedAt ?? null,
      durationMs: log?.finishedAt ? new Date(log.finishedAt).getTime() - new Date(log.startedAt).getTime() : null,
      isReal: true as const,
    }
  })

  async function refresh() {
    try {
      const logs = await fetchSyncLogs(basePath)
      latestLog.value = logs[0] ?? null
    } catch (error) {
      console.error(`Не удалось получить логи синхронизации ${basePath}`, error)
    }
  }

  async function pollUntilIdle() {
    const deadline = Date.now() + MAX_POLL_MS
    while (Date.now() < deadline) {
      await refresh()
      if (latestLog.value?.status !== 'RUNNING') return
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }
  }

  async function run() {
    if (isRunning.value) return
    isRunning.value = true
    const result = await triggerSync(basePath)
    if (!result.ok && result.conflict) {
      await pollUntilIdle()
    } else {
      await refresh()
    }
    isRunning.value = false
  }

  return { row, isRunning, run, refresh }
}
