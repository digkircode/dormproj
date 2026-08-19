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
  ACTIVE: 'fill-emerald-500 text-white',
  TERMINATED: 'fill-red-500 text-white',
  EXPIRED: 'fill-slate-400 text-white',
}

// Pill-стиль статуса — только обводка в цвет статуса, без заливки (по референсу, залитый
// фон убрали), текст обычным цветом, иконка остаётся цветной.
export const STATUS_PILL_CLASS: Record<ContractStatus, string> = {
  ACTIVE: 'border border-emerald-300 bg-background text-foreground dark:border-emerald-500/40',
  TERMINATED: 'border border-red-300 bg-background text-foreground dark:border-red-500/40',
  EXPIRED: 'border border-slate-300 bg-background text-foreground dark:border-slate-500/40',
}
