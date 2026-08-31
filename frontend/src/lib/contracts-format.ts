import { CircleCheck, CircleMinus, CircleX, Clock, PartyPopper } from 'lucide-vue-next'
import { i18n } from '@/i18n'
import type { ContractStatus } from './contracts-api'

// До 2026-08-31 EXPIRING не было значением ContractStatus в БД (EXPIRED так и не
// проставлялся автоматически) — этот модуль вычислял "Истекает" на лету по endDate. С тех
// пор ContractStatus сам по себе — полный жизненный цикл (ACTIVE/EXPIRING/OVERDUE/
// COMPLETED/TERMINATED, см. backend/prisma/schema.prisma, переходы считает ночной крон
// billing/contract-status.scheduler.ts), поэтому здесь остались только подписи/иконки/
// цвета под реальный статус, вычислять уже нечего.

// Proxy, не обычный объект — значения резолвятся через t() на каждое обращение, поэтому
// STATUS_LABELS[status] остаётся реактивным к смене языка везде, где уже используется
// (ContractStatusPill.vue и т.п.), без правки самих мест использования.
export const STATUS_LABELS: Record<ContractStatus, string> = new Proxy({} as Record<ContractStatus, string>, {
  get: (_target, status: string) => i18n.global.t(`contracts.status.${status}`),
})

export const STATUS_VARIANTS: Record<ContractStatus, 'default' | 'secondary' | 'destructive'> = {
  ACTIVE: 'default',
  EXPIRING: 'secondary',
  OVERDUE: 'destructive',
  COMPLETED: 'secondary',
  TERMINATED: 'destructive',
}

// Иконки статуса — тот же приём, что в sync-format.ts (галочка/крестик для логов синхронизации).
export const STATUS_ICON = {
  ACTIVE: CircleCheck,
  EXPIRING: Clock,
  OVERDUE: CircleMinus,
  COMPLETED: PartyPopper,
  TERMINATED: CircleX,
} as const satisfies Record<ContractStatus, unknown>

// Цвет иконки — тот же, что у EXPIRING/OVERDUE в ContractRegistryStatusCell.vue (Реестр
// договоров), чтобы "Истекает"/"Просрочен" читались одинаково в обоих местах приложения.
export const STATUS_ICON_CLASS: Record<ContractStatus, string> = {
  ACTIVE: 'text-emerald-500',
  EXPIRING: 'text-orange-500',
  OVERDUE: 'text-red-500',
  COMPLETED: 'text-emerald-500',
  TERMINATED: 'text-red-500',
}

// Pill-стиль статуса — по референсу нейтральная тонкая обводка и приглушённый текст
// одинаковые у всех статусов (не в цвет статуса — это была первая, неверная попытка),
// статус читается по цветной иконке, а не по цвету рамки/текста.
export const STATUS_PILL_CLASS: Record<ContractStatus, string> = {
  ACTIVE: 'border border-border bg-background text-muted-foreground',
  EXPIRING: 'border border-border bg-background text-muted-foreground',
  OVERDUE: 'border border-border bg-background text-muted-foreground',
  COMPLETED: 'border border-border bg-background text-muted-foreground',
  TERMINATED: 'border border-border bg-background text-muted-foreground',
}
