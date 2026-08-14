<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft, ChevronRight, Info } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from '@/components/ui/table'
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogScrollContent,
} from '@/components/ui/dialog'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { fetchSyncLogs, type SyncLogEntry } from '@/lib/sync-api'
import { SYNC_ENTITIES } from '@/lib/sync-entities'
import { statusLabel, statusIcon, statusIconClass, triggerLabel, formatDateTime } from '@/lib/sync-format'

const route = useRoute()
const entity = computed(() => SYNC_ENTITIES.find((e) => e.slug === route.params.slug))

const logs = ref<SyncLogEntry[]>([])
const isLoading = ref(true)
const selectedLog = ref<SyncLogEntry | null>(null)

const POLL_INTERVAL_MS = 3000
let pollTimeout: ReturnType<typeof setTimeout> | undefined

// Пока последний запуск ещё "В процессе", опрашиваем логи заново — иначе статус
// так и остаётся зависшим на RUNNING, пока страницу не перезагрузят руками.
async function load() {
  if (!entity.value) return
  logs.value = await fetchSyncLogs(entity.value.basePath)
  isLoading.value = false
  if (selectedLog.value) {
    selectedLog.value = logs.value.find((log) => log.id === selectedLog.value?.id) ?? selectedLog.value
  }
  if (logs.value.some((log) => log.status === 'RUNNING')) {
    pollTimeout = setTimeout(load, POLL_INTERVAL_MS)
  }
}

onMounted(load)
onUnmounted(() => clearTimeout(pollTimeout))
</script>

<template>
  <div class="flex flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-7" as-child>
        <RouterLink to="/sync">
          <ArrowLeft />
          <span class="sr-only">К синхронизации</span>
        </RouterLink>
      </Button>
      <h1 class="text-lg font-medium">Логи: {{ entity?.name ?? '—' }}</h1>
    </div>

    <Card class="gap-0 py-0">
      <Table>
        <TableHeader class="bg-muted sticky top-0 z-10">
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Тип</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead>Время начала</TableHead>
            <TableHead>Время окончания</TableHead>
            <TableHead class="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableEmpty v-if="!isLoading && !logs.length" :colspan="6">
            Логов пока нет
          </TableEmpty>
          <TableRow v-for="log in logs" :key="log.id">
            <TableCell class="text-muted-foreground">{{ log.id }}</TableCell>
            <TableCell>{{ triggerLabel[log.trigger] }}</TableCell>
            <TableCell>
              <span class="flex items-center gap-2">
                <component :is="statusIcon[statusLabel[log.status]]" class="size-4" :class="statusIconClass[statusLabel[log.status]]" />
                {{ statusLabel[log.status] }}
              </span>
            </TableCell>
            <TableCell class="text-muted-foreground">{{ formatDateTime(log.startedAt) }}</TableCell>
            <TableCell class="text-muted-foreground">{{ log.finishedAt ? formatDateTime(log.finishedAt) : '—' }}</TableCell>
            <TableCell>
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button variant="ghost" size="icon" class="size-7" @click="selectedLog = log">
                    <Info />
                    <span class="sr-only">Подробнее</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Подробнее</TooltipContent>
              </Tooltip>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Card>

    <Dialog :open="!!selectedLog" @update:open="(open) => { if (!open) selectedLog = null }">
      <DialogScrollContent v-if="selectedLog" class="flex min-w-0 flex-col gap-4">
        <DialogHeader>
          <DialogTitle>Лог #{{ selectedLog.id }}</DialogTitle>
          <DialogDescription>{{ formatDateTime(selectedLog.startedAt) }}</DialogDescription>
        </DialogHeader>

        <div class="grid min-w-0 grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <div>
            <div class="text-muted-foreground">Получено</div>
            <div>{{ selectedLog.fetchedCount ?? '—' }}</div>
          </div>
          <div>
            <div class="text-muted-foreground">Добавлено</div>
            <div>{{ selectedLog.added ?? '—' }}</div>
          </div>
          <div>
            <div class="text-muted-foreground">Обновлено</div>
            <div>{{ selectedLog.updated ?? '—' }}</div>
          </div>
          <div>
            <div class="text-muted-foreground">Удалено</div>
            <div>{{ selectedLog.removed ?? '—' }}</div>
          </div>
        </div>

        <p v-if="selectedLog.errorMessage" class="text-sm text-red-500 break-words">{{ selectedLog.errorMessage }}</p>

        <Collapsible v-if="selectedLog.errorStack" v-slot="{ open }">
          <CollapsibleTrigger class="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronRight class="size-4 shrink-0 transition-transform" :class="{ 'rotate-90': open }" />
            Показать дополнительные данные
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre class="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap break-words">{{ selectedLog.errorStack }}</pre>
          </CollapsibleContent>
        </Collapsible>
      </DialogScrollContent>
    </Dialog>
  </div>
</template>
