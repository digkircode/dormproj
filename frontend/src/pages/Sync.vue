<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { FileText } from 'lucide-vue-next'
import EntityTable from '@/components/EntityTable.vue'
import SyncOverviewStatusCell from '@/components/SyncOverviewStatusCell.vue'
import { createAppColumnHelper } from '@/lib/table'
import { useSyncRow } from '@/composables/useSyncRow'
import type { FacetOption, ListOptions, ListPage } from '@/lib/list-api'

interface SyncOverviewRow {
  slug: string
  name: string
  status: string
  time: string
  duration: string
  isRunning: boolean
  isReal: boolean
  run: () => Promise<void>
  startedAtRaw: string | null
  durationMs: number | null
}

const tableRef = ref<{ refresh: () => void | Promise<void> } | null>(null)

// Кнопка "Запустить" внутри SyncOverviewStatusCell.vue дёргает run() через строку —
// сама composable-реактивность (isRunning и т.п.) не долетает до уже отрисованной
// EntityTable (та держит свой rows как снимок, не живую ссылку), поэтому run
// оборачиваем так, чтобы сразу после запуска дёрнуть refresh() и подхватить
// isRunning=true — дальше её же собственный поллинг (onRowsLoaded ниже) подхватит
// момент завершения, тот же приём, что и в SyncLogs.vue.
function wrapRun(run: () => Promise<void>): () => Promise<void> {
  return async () => {
    void run()
    await tableRef.value?.refresh()
  }
}

const studentSync = useSyncRow('Контингент студентов', '/sync/students')
const individualsSync = useSyncRow('Физические лица', '/sync/individuals')
const citizenshipSync = useSyncRow('Гражданство', '/sync/citizenship')
const passportSync = useSyncRow('Паспортные данные', '/sync/passport')
const contactInfoSync = useSyncRow('Контактная информация', '/sync/contact-info')
const individualManualSync = useSyncRow('Обновление данных физического лица', '/sync/individual')

const rows = computed<SyncOverviewRow[]>(() => [
  { ...studentSync.row.value, isRunning: studentSync.isRunning.value, run: wrapRun(studentSync.run), slug: 'students' },
  { ...individualsSync.row.value, isRunning: individualsSync.isRunning.value, run: wrapRun(individualsSync.run), slug: 'individuals' },
  { ...citizenshipSync.row.value, isRunning: citizenshipSync.isRunning.value, run: wrapRun(citizenshipSync.run), slug: 'citizenship' },
  { ...passportSync.row.value, isRunning: passportSync.isRunning.value, run: wrapRun(passportSync.run), slug: 'passport' },
  { ...contactInfoSync.row.value, isRunning: contactInfoSync.isRunning.value, run: wrapRun(contactInfoSync.run), slug: 'contact-info' },
  // Запускается только с карточки конкретного физлица — здесь только строка с логами,
  // без кнопки "Запустить" (см. isReal ниже и SyncOverviewStatusCell.vue).
  {
    ...individualManualSync.row.value,
    isRunning: false,
    run: wrapRun(individualManualSync.run),
    slug: 'individual',
    isReal: false as const,
  },
])

const columnLabels: Record<string, string> = {
  name: 'Название',
  status: 'Статус',
  time: 'Время',
  duration: 'Длительность',
}
const filterableFields = ['status']
const cellRenderers = { status: SyncOverviewStatusCell }

const columnHelper = createAppColumnHelper<SyncOverviewRow>()
const columns = columnHelper.columns([
  columnHelper.accessor('name', { header: columnLabels.name, enableHiding: false, size: 280, minSize: 200 }),
  columnHelper.accessor('status', { header: columnLabels.status, size: 220, minSize: 180 }),
  columnHelper.accessor('time', { header: columnLabels.time, size: 176, minSize: 140 }),
  columnHelper.accessor('duration', { header: columnLabels.duration, size: 140, minSize: 110 }),
])

// Статус — фиксированный список (тот же принцип, что bucket/agingBucket в отчётах),
// не запрос к бэкенду: вся таблица собирается на клиенте из 6 независимых composable,
// у неё нет своего списочного эндпоинта.
const STATUS_OPTIONS: FacetOption[] = [
  { value: 'В процессе', label: 'В процессе' },
  { value: 'Успешно', label: 'Успешно' },
  { value: 'Ошибка', label: 'Ошибка' },
  { value: '—', label: 'Ещё не запускалась' },
]
async function fetchStatusFacets(field: string): Promise<FacetOption[]> {
  return field === 'status' ? STATUS_OPTIONS : []
}

function compareRows(a: SyncOverviewRow, b: SyncOverviewRow, sortBy: string): number {
  switch (sortBy) {
    case 'time': {
      const av = a.startedAtRaw ? new Date(a.startedAtRaw).getTime() : -Infinity
      const bv = b.startedAtRaw ? new Date(b.startedAtRaw).getTime() : -Infinity
      return av - bv
    }
    case 'duration': {
      const av = a.durationMs ?? -Infinity
      const bv = b.durationMs ?? -Infinity
      return av - bv
    }
    case 'status':
      return a.status.localeCompare(b.status, 'ru')
    default:
      return a.name.localeCompare(b.name, 'ru')
  }
}

// Ровно 6 строк, целиком в памяти на клиенте — тот же принцип in-memory пагинации/
// фильтрации/сортировки, что и в отчётах (backend/src/reports/list-helpers.ts),
// только на фронте, раз тут и бэкенд-списка своего нет (данные уже собраны по
// composables выше).
async function fetchSyncOverviewPage(options: ListOptions): Promise<ListPage<SyncOverviewRow>> {
  let filtered = rows.value

  const q = options.search.trim().toLowerCase()
  if (q) filtered = filtered.filter((r) => r.name.toLowerCase().includes(q))

  const statusFilter = options.filters.status
  if (statusFilter?.length) filtered = filtered.filter((r) => statusFilter.includes(r.status))

  const sorted = [...filtered].sort((a, b) => {
    const cmp = compareRows(a, b, options.sortBy)
    return options.sortDir === 'desc' ? -cmp : cmp
  })

  const start = (options.page - 1) * options.pageSize
  return { data: sorted.slice(start, start + options.pageSize), total: sorted.length, page: options.page, pageSize: options.pageSize }
}

// Пока хотя бы одна строка "В процессе" — опрашиваем таблицу заново через её же
// refresh() (тот же приём, что и в SyncLogs.vue), в том числе на случай запуска с
// другого устройства, а не только по нашей кнопке.
const POLL_INTERVAL_MS = 3000
let pollTimeout: ReturnType<typeof setTimeout> | undefined
function onRowsLoaded(loadedRows: SyncOverviewRow[]) {
  clearTimeout(pollTimeout)
  if (loadedRows.some((r) => r.isRunning)) {
    pollTimeout = setTimeout(() => tableRef.value?.refresh(), POLL_INTERVAL_MS)
  }
}
onUnmounted(() => clearTimeout(pollTimeout))

onMounted(async () => {
  await Promise.all([
    studentSync.refresh(),
    individualsSync.refresh(),
    citizenshipSync.refresh(),
    passportSync.refresh(),
    contactInfoSync.refresh(),
    individualManualSync.refresh(),
  ])
  await tableRef.value?.refresh()
})
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <EntityTable
      ref="tableRef"
      :columns="columns"
      :column-labels="columnLabels"
      :filterable-fields="filterableFields"
      :default-sort="{ id: 'name', desc: false }"
      :fetch-page="fetchSyncOverviewPage"
      :fetch-facet-values="fetchStatusFacets"
      :get-row-id="(r: SyncOverviewRow) => r.slug"
      total-label="синхронизаций"
      :cell-renderers="cellRenderers"
      :row-action="{ icon: FileText, label: 'Логи', getHref: (r: SyncOverviewRow) => `/sync/${r.slug}/logs` }"
      storage-key="sync-overview"
      accent-icons
      @loaded="onRowsLoaded"
    />
  </div>
</template>
