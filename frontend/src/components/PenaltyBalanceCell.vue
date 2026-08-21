<script setup lang="ts">
import { inject } from 'vue'

const props = defineProps<{ value: unknown; row?: { contractId: number } }>()

// EntityTable отдаёт cellRenderer только {value, row} — без возможности прокинуть свой
// колбэк конкретной колонке (генерик-компонент этого не знает). provide/inject — самый
// простой способ дотянуться до родительской страницы (ReportsDebt.vue), не расширяя
// контракт EntityTable ради одной колонки.
const openPenaltyLog = inject<(contractId: number) => void>('openPenaltyLog')

function formatMoney(value: number): string {
  return `${value.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`
}
</script>

<template>
  <button
    v-if="Number(props.value ?? 0) > 0 && props.row"
    type="button"
    class="rounded-sm text-red-500 underline decoration-dotted underline-offset-2 hover:text-red-600"
    @click="openPenaltyLog?.(props.row.contractId)"
  >
    {{ formatMoney(Number(props.value)) }}
  </button>
  <span v-else class="text-muted-foreground">{{ formatMoney(Number(props.value ?? 0)) }}</span>
</template>
