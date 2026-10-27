import { CircleCheck, CircleX, Loader } from 'lucide-vue-next'
import { i18n } from '@/i18n'

export type SyncStatusKey = 'RUNNING' | 'SUCCESS' | 'FAILED' | 'NONE'

export const statusLabel: Record<SyncStatusKey, string> = new Proxy({} as Record<SyncStatusKey, string>, {
  get: (_target, status: string) => (status === 'NONE' ? '-' : i18n.global.t(`sync.status.${status}`)),
})

export const triggerLabel: Record<'CRON' | 'MANUAL', string> = new Proxy({} as Record<'CRON' | 'MANUAL', string>, {
  get: (_target, trigger: string) => i18n.global.t(`sync.trigger.${trigger}`),
})

const STATUS_ICON: Record<Exclude<SyncStatusKey, 'NONE'>, typeof CircleCheck> = {
  SUCCESS: CircleCheck,
  FAILED: CircleX,
  RUNNING: Loader,
}
const STATUS_ICON_CLASS: Record<Exclude<SyncStatusKey, 'NONE'>, string> = {
  SUCCESS: 'text-emerald-500',
  FAILED: 'text-red-500',
  RUNNING: 'animate-spin text-muted-foreground',
}
export function syncStatusIcon(status: SyncStatusKey) {
  return status === 'NONE' ? undefined : STATUS_ICON[status]
}
export function syncStatusIconClass(status: SyncStatusKey): string {
  return status === 'NONE' ? '' : STATUS_ICON_CLASS[status]
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatDateTimeWithSeconds(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function formatDuration(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return '-'
  const seconds = Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000)
  const minutes = Math.floor(seconds / 60)
  return minutes > 0
    ? i18n.global.t('sync.durationMinutes', { minutes, seconds: seconds % 60 })
    : i18n.global.t('sync.durationSeconds', { seconds })
}
