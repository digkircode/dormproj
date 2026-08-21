<script setup lang="ts">
import { Loader, Play } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import SyncStatusPill from '@/components/SyncStatusPill.vue'

// row.status уже готовая русская подпись (В процессе/Успешно/Ошибка/—, см.
// useSyncRow.ts) — в отличие от SyncStatusCell.vue (тот получает сырой enum логов
// конкретного синхрона), здесь на уровне сводной таблицы /sync своего enum нет,
// isRunning считается отдельно от последнего лога.
const props = defineProps<{
  value: unknown
  row?: { isRunning: boolean; isReal: boolean; run: () => Promise<void> }
}>()
</script>

<template>
  <div class="flex items-center justify-center gap-2">
    <SyncStatusPill :status="value as string" />
    <Tooltip v-if="row?.isReal">
      <TooltipTrigger as-child>
        <Button variant="ghost" size="icon" class="size-6" :disabled="row.isRunning" @click.stop="row.run()">
          <Loader v-if="row.isRunning" class="size-3.5 animate-spin" />
          <Play v-else class="size-3.5 text-emerald-500" />
          <span class="sr-only">Запустить синхронизацию</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Запустить синхронизацию</TooltipContent>
    </Tooltip>
  </div>
</template>
