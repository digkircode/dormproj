<script setup lang="ts">
import { dateLocaleTag } from '@/lib/format-locale'

const props = defineProps<{ value: unknown; row?: unknown }>()

function formatMoney(value: number): string {
  return `${value.toLocaleString(dateLocaleTag(), { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`
}
</script>

<template>
  <span :class="Number(props.value ?? 0) > 0 ? 'text-red-500' : Number(props.value ?? 0) < 0 ? 'text-emerald-600 dark:text-emerald-400' : ''">
    {{ formatMoney(Number(props.value ?? 0)) }}
  </span>
</template>
