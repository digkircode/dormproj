<script setup lang="ts">
const props = defineProps<{ value: unknown; row?: unknown }>()

function formatMoney(value: number): string {
  return `${value.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`
}
</script>

<template>
  <span class="text-red-500">{{ formatMoney(Number(props.value ?? 0)) }}</span>
</template>
