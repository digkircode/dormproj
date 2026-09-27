<script setup lang="ts">
import type { AccrualRow } from '@/lib/contracts-api'
import { useI18n } from 'vue-i18n'
import { dateLocaleTag } from '@/lib/format-locale'

defineProps<{ value: unknown; row: AccrualRow }>()
const { t } = useI18n()

function formatMoney(value: number): string {
  return `${value.toLocaleString(dateLocaleTag(), { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`
}
</script>

<template>
  <span :class="!row.voidedAt && row.balance > 0 ? 'text-red-500' : ''">
    {{ row.voidedAt ? t('contracts.detail.voided') : formatMoney(row.balance) }}
  </span>
</template>
