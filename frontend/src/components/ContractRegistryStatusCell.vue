<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { AlertTriangle, CircleCheck, CircleX, Clock, PartyPopper } from 'lucide-vue-next'
import type { ContractRegistryBucket } from '@/lib/reports-api'

const props = defineProps<{ value: unknown; row?: unknown }>()

const { t } = useI18n()

// Proxy, не обычный объект — тот же приём, что STATUS_LABELS в contracts-format.ts,
// реактивен к смене языка. ACTIVE/COMPLETED/TERMINATED — обычные переводы (см.
// reports.registryBucket и в бэкенде, BUCKET_LABELS reports.controller.ts, те же ключи).
// EXPIRING/OVERDUE здесь всегда идут с числом дней (см. label ниже), у них нет отдельного
// bare-перевода — собираются целиком через reports.registry.expiringLabel/overdueLabel.
const BUCKET_LABELS: Record<ContractRegistryBucket, string> = new Proxy({} as Record<ContractRegistryBucket, string>, {
  get: (_target, status: string) => t(`reports.registryBucket.${status}`),
})
const BUCKET_ICON = {
  ACTIVE: CircleCheck,
  EXPIRING: Clock,
  OVERDUE: AlertTriangle,
  COMPLETED: PartyPopper,
  TERMINATED: CircleX,
} as const satisfies Record<ContractRegistryBucket, unknown>
// TERMINATED — красный (был серым/muted, как остальные), по прямой просьбе.
const BUCKET_ICON_CLASS: Record<ContractRegistryBucket, string> = {
  ACTIVE: 'text-emerald-500',
  EXPIRING: 'text-orange-500',
  OVERDUE: 'text-red-500',
  COMPLETED: 'text-emerald-500',
  TERMINATED: 'text-red-500',
}

const bucket = computed(() => props.value as ContractRegistryBucket)
const daysUntilEnd = computed(() => (props.row as { daysUntilEnd: number }).daysUntilEnd)

const label = computed(() => {
  if (bucket.value === 'EXPIRING') return t('reports.registry.expiringLabel', { days: daysUntilEnd.value })
  if (bucket.value === 'OVERDUE') return t('reports.registry.overdueLabel', { days: Math.abs(daysUntilEnd.value) })
  return BUCKET_LABELS[bucket.value]
})
</script>

<template>
  <span
    class="inline-flex w-fit max-w-full items-center gap-1 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-normal text-muted-foreground"
  >
    <component :is="BUCKET_ICON[bucket]" class="size-3.5 shrink-0" :class="BUCKET_ICON_CLASS[bucket]" />
    <span class="min-w-0 truncate">{{ label }}</span>
  </span>
</template>
