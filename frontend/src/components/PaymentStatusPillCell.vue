<script setup lang="ts">
import { Check, CircleMinus, Clock, X } from 'lucide-vue-next'
import { UNIFIED_PAYMENT_STATUS_LABELS, type UnifiedPaymentRow, type UnifiedPaymentStatus } from '@/lib/my-payments-api'

defineProps<{ value: unknown; row: UnifiedPaymentRow }>()

// Тот же приём, что ContractStatusPill.vue/contracts-format.ts: нейтральная рамка+фон у
// пилюли для всех статусов, цвет — только у иконки внутри.
const STATUS_ICON = {
  PAID: Check,
  REVERSED: CircleMinus,
  CREATED: Clock,
  PENDING_BANK: Clock,
  FAILED: X,
  CANCELED: X,
  EXPIRED: CircleMinus,
} as const satisfies Record<UnifiedPaymentStatus, unknown>

const STATUS_ICON_CLASS: Record<UnifiedPaymentStatus, string> = {
  PAID: 'text-emerald-500',
  REVERSED: 'text-muted-foreground',
  CREATED: 'text-muted-foreground',
  PENDING_BANK: 'text-orange-500',
  FAILED: 'text-red-500',
  CANCELED: 'text-muted-foreground',
  EXPIRED: 'text-muted-foreground',
}
</script>

<template>
  <!-- min-w-0 + max-w-full + truncate на тексте — без них длинный лейбл (например
       "Обрабатывается банком" у PENDING_BANK) в узкой колонке таблицы распирал пилюлю
       за пределы ячейки (ловушка №24 из общих ловушек проекта — тот же класс бага,
       что уже чинили в ContractLinkCell.vue/ResidentLinkCell.vue). -->
  <span class="inline-flex w-fit max-w-full items-center gap-1 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-normal text-muted-foreground">
    <component :is="STATUS_ICON[row.status]" class="size-3.5 shrink-0" :class="STATUS_ICON_CLASS[row.status]" />
    <span class="min-w-0 truncate">{{ UNIFIED_PAYMENT_STATUS_LABELS[row.status] }}</span>
  </span>
</template>
