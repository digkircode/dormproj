<script setup lang="ts">
const props = defineProps<{ value: unknown; row?: unknown }>()

function formatMoney(value: number): string {
  return `${value.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`
}
</script>

<template>
  <!-- Долг (>0) — красным, переплата (<0) — зелёным, ровно 0 — обычным цветом текста
       (по прямой просьбе, ноль это не долг и не переплата). -->
  <span :class="Number(props.value ?? 0) > 0 ? 'text-red-500' : Number(props.value ?? 0) < 0 ? 'text-emerald-600 dark:text-emerald-400' : ''">
    {{ formatMoney(Number(props.value ?? 0)) }}
  </span>
</template>
