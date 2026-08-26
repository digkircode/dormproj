<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import EntityTable from '@/components/EntityTable.vue'
import SyncOverviewStatusCell from '@/components/SyncOverviewStatusCell.vue'
import SyncOverviewActionsCell from '@/components/SyncOverviewActionsCell.vue'
import { createAppColumnHelper } from '@/lib/table'
import { useSyncRow } from '@/composables/useSyncRow'
import { statusLabel, type SyncStatusKey } from '@/lib/sync-format'
import type { FacetOption, ListOptions, ListPage } from '@/lib/list-api'
import { goBack } from '@/lib/utils'

const router = useRouter()
const { t } = useI18n()

interface SyncOverviewRow {
  slug: string
  name: string
  status: SyncStatusKey
  time: string
  duration: string
  isRunning: boolean
  isReal: boolean
  run: () => Promise<void>
  startedAtRaw: string | null
  durationMs: number | null
}

const tableRef = ref<{ refresh: () => void | Promise<void> } | null>(null)

// Кнопка "Запустить" внутри SyncOverviewActionsCell.vue дёргает run() через строку —
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

const studentSync = useSyncRow('nav.students', '/sync/students')
const individualsSync = useSyncRow('nav.individuals', '/sync/individuals')
const citizenshipSync = useSyncRow('nav.citizenship', '/sync/citizenship')
const passportSync = useSyncRow('nav.passportData', '/sync/passport')
const contactInfoSync = useSyncRow('nav.contactInfo', '/sync/contact-info')
const individualManualSync = useSyncRow('sync.individualEntityName', '/sync/individual')

const rows = computed<SyncOverviewRow[]>(() => [
  { ...studentSync.row.value, isRunning: studentSync.isRunning.value, run: wrapRun(studentSync.run), slug: 'students' },
  { ...individualsSync.row.value, isRunning: individualsSync.isRunning.value, run: wrapRun(individualsSync.run), slug: 'individuals' },
  { ...citizenshipSync.row.value, isRunning: citizenshipSync.isRunning.value, run: wrapRun(citizenshipSync.run), slug: 'citizenship' },
  { ...passportSync.row.value, isRunning: passportSync.isRunning.value, run: wrapRun(passportSync.run), slug: 'passport' },
  { ...contactInfoSync.row.value, isRunning: contactInfoSync.isRunning.value, run: wrapRun(contactInfoSync.run), slug: 'contact-info' },
  // Запускается только с карточки конкретного физлица — здесь только строка с логами,
  // без кнопки "Запустить" (см. isReal ниже и SyncOverviewActionsCell.vue).
  {
    ...individualManualSync.row.value,
    isRunning: false,
    run: wrapRun(individualManualSync.run),
    slug: 'individual',
    isReal: false as const,
  },
])

const columnLabels = computed<Record<string, string>>(() => ({
  name: t('sync.colName'),
  status: t('sync.colStatus'),
  time: t('sync.colTime'),
  duration: t('sync.colDuration'),
  actions: t('sync.colActions'),
}))
const filterableFields = ['status']
const cellRenderers = { status: SyncOverviewStatusCell, actions: SyncOverviewActionsCell }

const columnHelper = createAppColumnHelper<SyncOverviewRow>()
const columns = computed(() =>
  columnHelper.columns([
    columnHelper.accessor('name', { header: columnLabels.value.name, enableHiding: false, size: 280, minSize: 200 }),
    columnHelper.accessor('status', { header: columnLabels.value.status, size: 180, minSize: 150 }),
    columnHelper.accessor('time', { header: columnLabels.value.time, size: 176, minSize: 140 }),
    columnHelper.accessor('duration', { header: columnLabels.value.duration, size: 140, minSize: 110 }),
    // Действия (Логи+Запустить в одной ячейке) — обычная колонка с cellRenderer, не
    // встроенный rowAction у EntityTable: тот рассчитан ровно на одну кнопку, а тут их
    // две (см. SyncOverviewActionsCell.vue). enableSorting:false — сортировка по пустой
    // колонке без данных не имеет смысла.
    columnHelper.display({ id: 'actions', header: columnLabels.value.actions, enableSorting: false, enableHiding: false, size: 110, minSize: 96 }),
  ]),
)

// Статус — фиксированный список (тот же принцип, что bucket в ReportsContractsRegistry),
// не запрос к бэкенду: вся таблица собирается на клиенте из 6 независимых composable,
// у неё нет своего списочного эндпоинта. Собирается заново на каждый вызов (не константа
// модуля) — иначе лейблы не подхватили бы смену языка (statusLabel — Proxy, читает
// текущую локаль на каждое обращение, но массив из литералов, вычисленный один раз, всё
// равно бы застыл на значениях языка на момент импорта).
async function fetchStatusFacets(field: string): Promise<FacetOption[]> {
  if (field !== 'status') return []
  return [
    { value: 'RUNNING', label: statusLabel.RUNNING },
    { value: 'SUCCESS', label: statusLabel.SUCCESS },
    { value: 'FAILED', label: statusLabel.FAILED },
    { value: 'NONE', label: t('sync.notYetRun') },
  ]
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
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/')">
        <ArrowLeft class="text-primary" />
        <span class="sr-only">{{ t('sync.back') }}</span>
      </Button>
      <h1 class="text-lg font-medium">{{ t('sync.title') }}</h1>
    </div>

    <EntityTable
      ref="tableRef"
      :columns="columns"
      :column-labels="columnLabels"
      :filterable-fields="filterableFields"
      :default-sort="{ id: 'name', desc: false }"
      :fetch-page="fetchSyncOverviewPage"
      :fetch-facet-values="fetchStatusFacets"
      :get-row-id="(r: SyncOverviewRow) => r.slug"
      :total-label="t('sync.totalLabel')"
      :cell-renderers="cellRenderers"
      storage-key="sync-overview"
      accent-icons
      @loaded="onRowsLoaded"
    />
  </div>
</template>
