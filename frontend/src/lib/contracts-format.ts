import { CircleCheck, CircleMinus, CircleX, Clock, PartyPopper } from 'lucide-vue-next'
import { i18n } from '@/i18n'
import type { ContractStatus } from './contracts-api'


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

export const STATUS_ICON = {
  ACTIVE: CircleCheck,
  EXPIRING: Clock,
  OVERDUE: CircleMinus,
  COMPLETED: PartyPopper,
  TERMINATED: CircleX,
} as const satisfies Record<ContractStatus, unknown>

export const STATUS_ICON_CLASS: Record<ContractStatus, string> = {
  ACTIVE: 'text-emerald-500',
  EXPIRING: 'text-orange-500',
  OVERDUE: 'text-red-500',
  COMPLETED: 'text-emerald-500',
  TERMINATED: 'text-red-500',
}

export const STATUS_PILL_CLASS: Record<ContractStatus, string> = {
  ACTIVE: 'border border-border bg-background text-muted-foreground',
  EXPIRING: 'border border-border bg-background text-muted-foreground',
  OVERDUE: 'border border-border bg-background text-muted-foreground',
  COMPLETED: 'border border-border bg-background text-muted-foreground',
  TERMINATED: 'border border-border bg-background text-muted-foreground',
}
