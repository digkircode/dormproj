import { CircleCheck, CircleMinus, CircleX } from 'lucide-vue-next'
import type { ContractStatus } from './contracts-api'

export const STATUS_LABELS: Record<ContractStatus, string> = {
  ACTIVE: 'Действует',
  TERMINATED: 'Расторгнут',
  EXPIRED: 'Истёк',
}

export const STATUS_VARIANTS: Record<ContractStatus, 'default' | 'secondary' | 'destructive'> = {
  ACTIVE: 'default',
  TERMINATED: 'destructive',
  EXPIRED: 'secondary',
}

// Иконки статуса — тот же приём, что в sync-format.ts (галочка/крестик для логов синхронизации).
export const STATUS_ICON = {
  ACTIVE: CircleCheck,
  TERMINATED: CircleX,
  EXPIRED: CircleMinus,
} as const satisfies Record<ContractStatus, unknown>

export const STATUS_ICON_CLASS: Record<ContractStatus, string> = {
  ACTIVE: 'text-emerald-500',
  TERMINATED: 'text-red-500',
  EXPIRED: 'text-muted-foreground',
}

// Pill-стиль статуса — по референсу нейтральная тонкая обводка и приглушённый текст
// одинаковые у всех статусов (не в цвет статуса — это была первая, неверная попытка),
// статус читается по цветной иконке, а не по цвету рамки/текста.
export const STATUS_PILL_CLASS: Record<ContractStatus, string> = {
  ACTIVE: 'border border-border bg-background text-muted-foreground',
  TERMINATED: 'border border-border bg-background text-muted-foreground',
  EXPIRED: 'border border-border bg-background text-muted-foreground',
}
