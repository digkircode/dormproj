import { CircleCheck, CircleMinus, CircleX, Clock } from 'lucide-vue-next'
import type { ContractStatus } from './contracts-api'

// EXPIRING — не значение ContractStatus в БД (там до автоматического EXPIRED дело не
// доходит, см. известный гэп в промпте проекта), а чисто отображаемый статус: ACTIVE-договор,
// у которого endDate уже в пределах ближайших 30 дней. Тот же порог/принцип, что и bucket
// в "Реестре договоров" (reports.controller.ts), но здесь — для основного списка /contracts.
export type ContractDisplayStatus = ContractStatus | 'EXPIRING'

const EXPIRING_WINDOW_DAYS = 30

export function getContractDisplayStatus(status: ContractStatus, endDate: string): ContractDisplayStatus {
  if (status !== 'ACTIVE') return status
  const daysUntilEnd = Math.round((new Date(endDate).getTime() - Date.now()) / 86_400_000)
  if (daysUntilEnd >= 0 && daysUntilEnd <= EXPIRING_WINDOW_DAYS) return 'EXPIRING'
  return status
}

export const STATUS_LABELS: Record<ContractDisplayStatus, string> = {
  ACTIVE: 'Действует',
  EXPIRING: 'Истекает',
  TERMINATED: 'Расторгнут',
  EXPIRED: 'Истёк',
}

export const STATUS_VARIANTS: Record<ContractDisplayStatus, 'default' | 'secondary' | 'destructive'> = {
  ACTIVE: 'default',
  EXPIRING: 'secondary',
  TERMINATED: 'destructive',
  EXPIRED: 'secondary',
}

// Иконки статуса — тот же приём, что в sync-format.ts (галочка/крестик для логов синхронизации).
export const STATUS_ICON = {
  ACTIVE: CircleCheck,
  EXPIRING: Clock,
  TERMINATED: CircleX,
  EXPIRED: CircleMinus,
} as const satisfies Record<ContractDisplayStatus, unknown>

// Цвет иконки — тот же, что у EXPIRING/OVERDUE в ContractRegistryStatusCell.vue (Реестр
// договоров), чтобы "Истекает" читался одинаково в обоих местах приложения.
export const STATUS_ICON_CLASS: Record<ContractDisplayStatus, string> = {
  ACTIVE: 'text-emerald-500',
  EXPIRING: 'text-orange-500',
  TERMINATED: 'text-red-500',
  EXPIRED: 'text-muted-foreground',
}

// Pill-стиль статуса — по референсу нейтральная тонкая обводка и приглушённый текст
// одинаковые у всех статусов (не в цвет статуса — это была первая, неверная попытка),
// статус читается по цветной иконке, а не по цвету рамки/текста.
export const STATUS_PILL_CLASS: Record<ContractDisplayStatus, string> = {
  ACTIVE: 'border border-border bg-background text-muted-foreground',
  EXPIRING: 'border border-border bg-background text-muted-foreground',
  TERMINATED: 'border border-border bg-background text-muted-foreground',
  EXPIRED: 'border border-border bg-background text-muted-foreground',
}
