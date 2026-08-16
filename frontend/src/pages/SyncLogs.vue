<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft, ChevronRight, Info } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogScrollContent,
} from '@/components/ui/dialog'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import EntityTable from '@/components/EntityTable.vue'
import SyncStatusCell from '@/components/SyncStatusCell.vue'
import { createAppColumnHelper } from '@/lib/table'
import { fetchSyncLogsPage, fetchSyncLogFacets, type SyncLogEntry } from '@/lib/sync-api'
import { SYNC_ENTITIES } from '@/lib/sync-entities'
import { triggerLabel, formatDateTimeWithSeconds } from '@/lib/sync-format'
import type { ListOptions } from '@/lib/list-api'

const route = useRoute()
const entity = computed(() => SYNC_ENTITIES.find((e) => e.slug === route.params.slug))
const storageKey = computed(() => `sync-logs:${entity.value?.slug ?? 'unknown'}`)

const selectedLog = ref<SyncLogEntry | null>(null)
const tableRef = ref<{ refresh: () => void | Promise<void> } | null>(null)

const columnLabels: Record<string, string> = {
  rowNumber: '№',
  trigger: 'Тип',
  targetUid: 'UID',
  status: 'Статус',
  startedAt: 'Время начала',
  finishedAt: 'Время окончания',
}
// У точечной синхронизации физлица Trigger всегда MANUAL — фильтр по нему бессмысленен.
const filterableFields = computed(() => (entity.value?.showTargetUid ? ['status'] : ['status', 'trigger']))
const cellRenderers = { status: SyncStatusCell }

function cellText(columnId: string, value: unknown): string {
  if (columnId === 'trigger' && typeof value === 'string') {
    return triggerLabel[value as keyof typeof triggerLabel] ?? value
  }
  if (columnId === 'startedAt' && typeof value === 'string') {
    return formatDateTimeWithSeconds(value)
  }
  if (columnId === 'finishedAt') {
    return typeof value === 'string' ? formatDateTimeWithSeconds(value) : '—'
  }
  return String(value ?? '')
}

const columnHelper = createAppColumnHelper<SyncLogEntry>()

// id (сквозной по всей таблице SyncLog, партиционированной по всем 6 типам синхронов)
// сюда не выводим — в списке нужен порядковый номер именно для этого синхрона,
// сам id остаётся доступен в модалке "Подробнее" (см. openLogDetails). У точечной
// синхронизации физлица вместо "Тип" (Trigger всегда MANUAL, бесполезная колонка) —
// UID синхронизированного физлица.
const columns = computed(() =>
  columnHelper.columns([
    columnHelper.accessor('rowNumber', {
      header: columnLabels.rowNumber,
      enableHiding: false,
      size: 64,
      minSize: 56,
    }),
    entity.value?.showTargetUid
      ? columnHelper.accessor('targetUid', { header: columnLabels.targetUid, size: 280, minSize: 200 })
      : columnHelper.accessor('trigger', { header: columnLabels.trigger, size: 160, minSize: 120 }),
    columnHelper.accessor('status', { header: columnLabels.status, size: 144, minSize: 110 }),
    columnHelper.accessor('startedAt', { header: columnLabels.startedAt, size: 176, minSize: 140 }),
    columnHelper.accessor('finishedAt', { header: columnLabels.finishedAt, size: 176, minSize: 140 }),
  ]),
)

function fetchPage(options: ListOptions) {
  return fetchSyncLogsPage(entity.value?.basePath ?? '', options)
}

function fetchFacetValues(field: string) {
  return fetchSyncLogFacets(entity.value?.basePath ?? '', field)
}

function openLogDetails(log: SyncLogEntry) {
  selectedLog.value = log
}

const POLL_INTERVAL_MS = 3000
let pollTimeout: ReturnType<typeof setTimeout> | undefined

// Пока последний запуск ещё "В процессе", опрашиваем таблицу заново через её же
// refresh() — она сама решит, показывать ли лоадер, и не потеряет текущую страницу/
// сортировку/фильтры пользователя (в отличие от полного ремаунта компонента).
function onLogsLoaded(logs: SyncLogEntry[]) {
  if (selectedLog.value) {
    selectedLog.value = logs.find((log) => log.id === selectedLog.value?.id) ?? selectedLog.value
  }
  clearTimeout(pollTimeout)
  if (logs.some((log) => log.status === 'RUNNING')) {
    pollTimeout = setTimeout(() => tableRef.value?.refresh(), POLL_INTERVAL_MS)
  }
}

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

    <EntityTable
      ref="tableRef"
      :columns="columns"
      :column-labels="columnLabels"
      :filterable-fields="filterableFields"
      :default-sort="{ id: 'rowNumber', desc: true }"
      :fetch-page="fetchPage"
      :fetch-facet-values="fetchFacetValues"
      :get-row-id="(log: SyncLogEntry) => String(log.id)"
      total-label="записей"
      :cell-text="cellText"
      :cell-renderers="cellRenderers"
      :row-action="{ icon: Info, label: 'Подробнее', onClick: openLogDetails }"
      :storage-key="storageKey"
      @loaded="onLogsLoaded"
    />

    <Dialog :open="!!selectedLog" @update:open="(open) => { if (!open) selectedLog = null }">
      <DialogScrollContent v-if="selectedLog" class="flex min-w-0 flex-col gap-4">
        <DialogHeader>
          <DialogTitle>Лог #{{ selectedLog.id }}</DialogTitle>
          <DialogDescription>{{ formatDateTimeWithSeconds(selectedLog.startedAt) }}</DialogDescription>
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
