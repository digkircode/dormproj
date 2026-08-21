<script setup lang="ts">
import { computed } from 'vue'
import type { MovementOperation } from '@/lib/reports-api'

const props = defineProps<{ value: unknown; row?: unknown }>()

const OPERATION_LABELS: Record<MovementOperation, string> = {
  IN: 'Заселение',
  OUT: 'Выселение',
  MOVE: 'Переселение',
  RENEWAL: 'Продление',
}
const OPERATION_DOT_CLASS: Record<MovementOperation, string> = {
  IN: 'bg-emerald-500',
  OUT: 'bg-red-500',
  MOVE: 'bg-orange-500',
  RENEWAL: 'bg-sky-400',
}

const operation = computed(() => props.value as MovementOperation)
</script>

<template>
  <span class="inline-flex items-center gap-1.5">
    <span class="size-2 rounded-full" :class="OPERATION_DOT_CLASS[operation]" />
    {{ OPERATION_LABELS[operation] }}
  </span>
</template>
