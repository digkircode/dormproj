import { CircleCheck, CircleX, Loader } from 'lucide-vue-next'

export const statusLabel = {
  RUNNING: 'В процессе',
  SUCCESS: 'Успешно',
  FAILED: 'Ошибка',
} as const

export const triggerLabel = {
  CRON: 'Автоматически',
  MANUAL: 'Вручную',
} as const

export const statusIcon = {
  'Успешно': CircleCheck,
  'Ошибка': CircleX,
  'В процессе': Loader,
} as const

export const statusIconClass: Record<string, string> = {
  'Успешно': 'fill-emerald-500 text-white',
  'Ошибка': 'fill-red-500 text-white',
  'В процессе': 'animate-spin text-muted-foreground',
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
  if (!finishedAt) return '—'
  const seconds = Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000)
  const minutes = Math.floor(seconds / 60)
  return minutes > 0 ? `${minutes}м ${seconds % 60}с` : `${seconds}с`
}
