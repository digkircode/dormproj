import { computed, ref } from 'vue'
import { i18n } from '@/i18n'
import { fetchSyncLogs, triggerSync, type SyncLogEntry } from '@/lib/sync-api'
import { formatDateTime, formatDuration, type SyncStatusKey } from '@/lib/sync-format'

const POLL_INTERVAL_MS = 3000
const MAX_POLL_MS = 3 * 60 * 1000

// Один и тот же паттерн (строка на /sync с реальным статусом, запуском и опросом
// при конфликте) нужен нескольким синхронам подряд — вынесено, чтобы не копипастить.
// nameKey — ключ i18n (не готовый текст), резолвится внутри row (computed) на каждое
// обращение — иначе смена языка не поменяла бы уже отрисованное название строки
// (тот же принцип, что computed columnLabels на страницах отчётов).
export function useSyncRow(nameKey: string, basePath: string) {
  const latestLog = ref<SyncLogEntry | null>(null)
  const isRunning = ref(false)

  const row = computed(() => {
    const log = latestLog.value
    const status: SyncStatusKey = isRunning.value ? 'RUNNING' : log ? log.status : 'NONE'
    return {
      name: i18n.global.t(nameKey),
      status,
      time: log ? formatDateTime(log.startedAt) : '—',
      duration: log ? formatDuration(log.startedAt, log.finishedAt) : '—',
      // Сырые значения — для сортировки по времени/длительности на странице /sync
      // (EntityTable), где time/duration уже отформатированные строки и по ним
      // сортировать некорректно ("21.08.2026" не сортируется лексикографически как дата).
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

  // Если синхронизацию уже запустили с другого устройства, наш POST сразу вернёт 409 —
  // но сам запуск где-то там всё ещё идёт. Раньше статус тут просто замирал на моменте
  // конфликта; теперь опрашиваем логи, пока чужой запуск не завершится.
  async function pollUntilIdle() {
    const deadline = Date.now() + MAX_POLL_MS
    while (Date.now() < deadline) {
      await refresh()
      if (latestLog.value?.status !== 'RUNNING') return
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }
  }

  // Ошибку синхронизации отдельно на фронте не показываем — она отражается в
  // изменившемся статусе строки, а подробности смотрят в логах через кнопку «Логи».
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
