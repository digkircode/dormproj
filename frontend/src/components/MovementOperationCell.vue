<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MovementOperation } from '@/lib/reports-api'

const props = defineProps<{ value: unknown; row?: unknown }>()

const { t } = useI18n()

// Proxy, не обычный объект — тот же приём, что STATUS_LABELS в contracts-format.ts,
// реактивен к смене языка (см. те же ключи в MOVEMENT_LABELS reports.controller.ts).
const OPERATION_LABELS: Record<MovementOperation, string> = new Proxy({} as Record<MovementOperation, string>, {
  get: (_target, operation: string) => t(`reports.movementOperation.${operation}`),
})
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
