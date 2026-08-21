<script setup lang="ts">
import SyncStatusPill from '@/components/SyncStatusPill.vue'

// value уже готовая русская подпись (В процессе/Успешно/Ошибка/—, см. useSyncRow.ts) —
// в отличие от SyncStatusCell.vue (тот получает сырой enum логов конкретного синхрона),
// здесь на уровне сводной таблицы /sync своего enum нет, isRunning считается отдельно
// от последнего лога. Кнопка "Запустить" раньше была тут же — перенесена в общую с
// "Логи" колонку действий, см. SyncOverviewActionsCell.vue.
defineProps<{ value: unknown; row?: unknown }>()
</script>

<template>
  <div class="flex justify-center">
    <SyncStatusPill :status="value as string" />
  </div>
</template>
