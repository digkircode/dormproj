<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle, CircleCheck, CircleX, Clock } from 'lucide-vue-next'
import type { ContractRegistryBucket } from '@/lib/reports-api'

const props = defineProps<{ value: unknown; row?: unknown }>()

const BUCKET_LABELS: Record<ContractRegistryBucket, string> = {
  ACTIVE: 'Активен',
  EXPIRING: 'Истекает',
  OVERDUE: 'Просрочен',
  TERMINATED: 'Расторгнут',
}
const BUCKET_ICON = {
  ACTIVE: CircleCheck,
  EXPIRING: Clock,
  OVERDUE: AlertTriangle,
  TERMINATED: CircleX,
} as const satisfies Record<ContractRegistryBucket, unknown>
// TERMINATED — красный (был серым/muted, как остальные), по прямой просьбе.
const BUCKET_ICON_CLASS: Record<ContractRegistryBucket, string> = {
  ACTIVE: 'text-emerald-500',
  EXPIRING: 'text-orange-500',
  OVERDUE: 'text-red-500',
  TERMINATED: 'text-red-500',
}

const bucket = computed(() => props.value as ContractRegistryBucket)
const daysUntilEnd = computed(() => (props.row as { daysUntilEnd: number }).daysUntilEnd)

const label = computed(() => {
  if (bucket.value === 'EXPIRING') return `${BUCKET_LABELS.EXPIRING} (${daysUntilEnd.value} дн.)`
  if (bucket.value === 'OVERDUE') return `${BUCKET_LABELS.OVERDUE} на ${Math.abs(daysUntilEnd.value)} дн.`
  return BUCKET_LABELS[bucket.value]
})
</script>

<template>
  <span
    class="inline-flex w-fit items-center gap-1 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-normal text-muted-foreground"
  >
    <component :is="BUCKET_ICON[bucket]" class="size-3.5" :class="BUCKET_ICON_CLASS[bucket]" />
    {{ label }}
  </span>
</template>
