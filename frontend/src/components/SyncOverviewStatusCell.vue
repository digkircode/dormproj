<script setup lang="ts">
import type { SyncStatusKey } from '@/lib/sync-format'
import SyncStatusPill from '@/components/SyncStatusPill.vue'

// value — тот же набор ключей (RUNNING/SUCCESS/FAILED/NONE), что и у SyncStatusCell.vue,
// только считанный не из enum лога, а из isRunning + последнего лога (см. useSyncRow.ts) —
// на уровне сводной таблицы /sync своего списочного бэкенд-эндпоинта нет. Кнопка "Запустить"
// раньше была тут же — перенесена в общую с "Логи" колонку действий, см. SyncOverviewActionsCell.vue.
defineProps<{ value: unknown; row?: unknown }>()
</script>

<template>
  <div class="flex justify-center">
    <SyncStatusPill :status="value as SyncStatusKey" />
  </div>
</template>
