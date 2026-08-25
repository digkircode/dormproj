<script setup lang="ts">
import type { AccrualRow } from '@/lib/contracts-api'

defineProps<{ value: unknown; row: AccrualRow }>()

function formatMoney(value: number): string {
  return `${value.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`
}
</script>

<template>
  <span :class="!row.voidedAt && row.balance > 0 ? 'text-red-500' : ''">
    {{ row.voidedAt ? 'отменено' : formatMoney(row.balance) }}
  </span>
</template>
