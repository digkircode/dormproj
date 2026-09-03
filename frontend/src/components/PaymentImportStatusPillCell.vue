<script setup lang="ts">
import { Check, Clock, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { PaymentImportRow } from '@/lib/payment-imports-api'

defineProps<{ value: unknown; row: PaymentImportRow }>()
const { t } = useI18n()

// Тот же визуальный приём, что и PaymentStatusPillCell.vue (объединённая история
// платежей резидента) — нейтральная рамка+фон у пилюли для всех статусов, цвет только
// у иконки внутри.
const STATUS_ICON = {
  IMPORTED: Clock,
  NEEDS_REVIEW: Clock,
  MATCHED: Check,
  REJECTED: X,
} as const satisfies Record<PaymentImportRow['status'], unknown>

const STATUS_ICON_CLASS: Record<PaymentImportRow['status'], string> = {
  IMPORTED: 'text-orange-500',
  NEEDS_REVIEW: 'text-orange-500',
  MATCHED: 'text-emerald-500',
  REJECTED: 'text-muted-foreground',
}
</script>

<template>
  <!-- min-w-0 + max-w-full + truncate на тексте — тот же приём, что у остальных
       пилюлей в проекте, без него длинный лейбл распирает ячейку. -->
  <span class="inline-flex w-fit max-w-full items-center gap-1 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-normal text-muted-foreground">
    <component :is="STATUS_ICON[row.status]" class="size-3.5 shrink-0" :class="STATUS_ICON_CLASS[row.status]" />
    <span class="min-w-0 truncate">{{ t(`paymentImports.status.${row.status}`) }}</span>
  </span>
</template>
