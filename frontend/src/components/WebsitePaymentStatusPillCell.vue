<script setup lang="ts">
import { Check, RotateCw, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

type Status = 'NOT_SYNCED' | 'SYNCED' | 'FAILED'

// row — WebsiteTableRow из PaymentImports.vue, структурно достаточно поля status
// (не импортируем тип страницы сюда, чтобы не тянуть цикл — тот же приём, что и у
// остальных cellRenderer-компонентов проекта, они завязаны на форму, не на конкретный тип).
defineProps<{ value: unknown; row: { status: Status } }>()
const { t } = useI18n()

// Те же иконки/цвета, что и Accounting1cStatusPill.vue (карточка договора) — одна и та
// же семантика статуса отправки в 1С, показывается одинаково в обоих местах.
const STATUS_ICON = { NOT_SYNCED: RotateCw, SYNCED: Check, FAILED: X } as const satisfies Record<Status, unknown>
const STATUS_ICON_CLASS: Record<Status, string> = {
  NOT_SYNCED: 'text-muted-foreground',
  SYNCED: 'text-emerald-500',
  FAILED: 'text-red-500',
}
</script>

<template>
  <span class="inline-flex w-fit max-w-full items-center gap-1 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-normal text-muted-foreground">
    <component :is="STATUS_ICON[row.status]" class="size-3.5 shrink-0" :class="STATUS_ICON_CLASS[row.status]" />
    <span class="min-w-0 truncate">{{ t(`paymentImports.statusWebsite.${row.status}`) }}</span>
  </span>
</template>
