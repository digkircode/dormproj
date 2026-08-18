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
