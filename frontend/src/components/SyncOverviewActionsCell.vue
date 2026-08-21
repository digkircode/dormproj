<script setup lang="ts">
import { FileText, Loader, Play } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

// Обе колоночные экшн-кнопки (Логи + Запустить) в одной ячейке — по прямой просьбе,
// раньше "Запустить" была рядом со статус-пиллом (см. SyncOverviewStatusCell.vue).
defineProps<{
  value?: unknown
  row?: { slug: string; isRunning: boolean; isReal: boolean; run: () => Promise<void> }
}>()
</script>

<template>
  <div class="flex items-center justify-center gap-1">
    <Tooltip>
      <TooltipTrigger as-child>
        <Button variant="ghost" size="icon" class="size-7" as-child>
          <RouterLink :to="`/sync/${row?.slug}/logs`">
            <FileText class="text-primary" />
            <span class="sr-only">Логи</span>
          </RouterLink>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Логи</TooltipContent>
    </Tooltip>
    <Tooltip v-if="row?.isReal">
      <TooltipTrigger as-child>
        <Button variant="ghost" size="icon" class="size-7" :disabled="row.isRunning" @click="row.run()">
          <Loader v-if="row.isRunning" class="animate-spin" />
          <Play v-else class="text-emerald-500" />
          <span class="sr-only">Запустить синхронизацию</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Запустить синхронизацию</TooltipContent>
    </Tooltip>
  </div>
</template>
