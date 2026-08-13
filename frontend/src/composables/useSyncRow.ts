import { computed, ref } from 'vue'
import { fetchSyncLogs, triggerSync, type SyncLogEntry } from '@/lib/sync-api'

const statusLabel = {
  RUNNING: 'В процессе',
  SUCCESS: 'Успешно',
  FAILED: 'Ошибка',
} as const

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatDuration(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return '—'
  const seconds = Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000)
  const minutes = Math.floor(seconds / 60)
  return minutes > 0 ? `${minutes}м ${seconds % 60}с` : `${seconds}с`
}

const POLL_INTERVAL_MS = 3000
const MAX_POLL_MS = 3 * 60 * 1000

// Один и тот же паттерн (строка на /sync с реальным статусом, запуском и опросом
// при конфликте) нужен нескольким синхронам подряд — вынесено, чтобы не копипастить.
export function useSyncRow(name: string, basePath: string) {
  const latestLog = ref<SyncLogEntry | null>(null)
  const isRunning = ref(false)
  const errorText = ref('')

  const row = computed(() => {
    const log = latestLog.value
    return {
      name,
      status: isRunning.value ? 'В процессе' : log ? statusLabel[log.status] : '—',
      time: log ? formatDateTime(log.startedAt) : '—',
      duration: log ? formatDuration(log.startedAt, log.finishedAt) : '—',
      isReal: true as const,
    }
  })

  async function refresh() {
    try {
      const logs = await fetchSyncLogs(basePath)
      latestLog.value = logs[0] ?? null
    } catch (error) {
      errorText.value = error instanceof Error ? error.message : String(error)
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

  async function run() {
    if (isRunning.value) return
    isRunning.value = true
    errorText.value = ''
    const result = await triggerSync(basePath)
    if (result.ok) {
      await refresh()
    } else if (result.conflict) {
      await pollUntilIdle()
    } else {
      errorText.value = result.message
      await refresh()
    }
    isRunning.value = false
  }

  return { row, isRunning, errorText, run, refresh }
}
