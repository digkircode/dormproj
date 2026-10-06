<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { AlertTriangle, ArrowLeft, CircleCheck, CircleX, Clock, Download } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import EntityTable from '@/components/EntityTable.vue'
import ContractLinkCell from '@/components/ContractLinkCell.vue'
import ResidentLinkCell from '@/components/ResidentLinkCell.vue'
import ContractRegistryStatusCell from '@/components/ContractRegistryStatusCell.vue'
import ReportKpiTile from '@/components/ReportKpiTile.vue'
import ReportKpiSkeleton from '@/components/ReportKpiSkeleton.vue'
import DatePickerField from '@/components/DatePickerField.vue'
import { createAppColumnHelper } from '@/lib/table'
import {
  fetchContractsRegistryPage,
  fetchContractsRegistryFacets,
  fetchContractsRegistrySummary,
  exportContractsRegistryExcel,
  type ContractRegistryRow,
  type ContractsRegistrySummary,
  type ListOptions,
} from '@/lib/reports-api'
import { goBack } from '@/lib/utils'
import { todayIso } from '@/lib/format-locale'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()

// Переход с "Главной" (StaffHomeDashboard.vue) — тайлы "Просроченные"/"Истекающие" ведут
// сюда с ?bucket=OVERDUE/EXPIRING, чтобы таблица сразу открывалась с применённым фильтром
// (по прямой просьбе 2026-09-05), а не просто на список без выборки.
const initialFilters = computed<Record<string, string[]>>(() => {
  const bucket = route.query.bucket
  const filters: Record<string, string[]> = {}
  if (typeof bucket === 'string' && bucket) filters.bucket = [bucket]
  return filters
})

const columnLabels = computed<Record<string, string>>(() => ({
  contractNumber: t('reports.registry.colContractNumber'),
  residentFullName: t('reports.registry.colResident'),
  room: t('reports.registry.colRoom'),
  createdAt: t('reports.registry.colCreatedAt'),
  startDate: t('reports.registry.colStart'),
  endDate: t('reports.registry.colEnd'),
  bucket: t(asOf.value < todayIso() ? 'reports.registry.colStatusCalculated' : 'reports.registry.colStatus'),
}))
const filterableFields = ['bucket']
const cellRenderers = { contractNumber: ContractLinkCell, residentFullName: ResidentLinkCell, bucket: ContractRegistryStatusCell }

function formatDateIso(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
}
function cellText(columnId: string, value: unknown): string {
  if ((columnId === 'createdAt' || columnId === 'startDate' || columnId === 'endDate') && typeof value === 'string') {
    return formatDateIso(value)
  }
  return String(value ?? '')
}

const columnHelper = createAppColumnHelper<ContractRegistryRow>()
const columns = computed(() =>
  columnHelper.columns([
    columnHelper.accessor('contractNumber', { header: columnLabels.value.contractNumber, enableHiding: false, size: 128, minSize: 100 }),
    columnHelper.accessor('residentFullName', { header: columnLabels.value.residentFullName, size: 220, minSize: 160 }),
    columnHelper.accessor('room', { header: columnLabels.value.room, size: 110, minSize: 90 }),
    columnHelper.accessor('createdAt', { header: columnLabels.value.createdAt, size: 128, minSize: 100 }),
    columnHelper.accessor('startDate', { header: columnLabels.value.startDate, size: 128, minSize: 100 }),
    columnHelper.accessor('endDate', { header: columnLabels.value.endDate, size: 128, minSize: 100 }),
    columnHelper.accessor('bucket', { header: columnLabels.value.bucket, size: 160, minSize: 130 }),
  ]),
)

const asOf = ref(todayIso())
const entityTable = ref<{ refresh: () => void } | null>(null)
function fetchPage(options: ListOptions, signal?: AbortSignal) {
  return fetchContractsRegistryPage(options, asOf.value, signal)
}

const summary = ref<ContractsRegistrySummary | null>(null)
const summaryError = ref('')
let summaryRequest = 0
async function loadSummary() {
  const request = ++summaryRequest
  summary.value = null
  summaryError.value = ''
  try {
    const result = await fetchContractsRegistrySummary(asOf.value)
    if (request === summaryRequest) summary.value = result
  } catch (error) {
    if (request === summaryRequest) summaryError.value = error instanceof Error ? error.message : String(error)
  }
}
watch(asOf, () => {
  void loadSummary()
  entityTable.value?.refresh()
})
onMounted(loadSummary)

const isExporting = ref(false)
const exportError = ref('')
async function onExport() {
  exportError.value = ''
  isExporting.value = true
  try {
    await exportContractsRegistryExcel(asOf.value)
  } catch (error) {
    exportError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isExporting.value = false
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/')">
        <ArrowLeft class="text-primary" />
        <span class="sr-only">{{ t('reports.common.back') }}</span>
      </Button>
      <h1 class="text-lg font-medium">{{ t('reports.registry.title') }}</h1>
    </div>
    <p v-if="asOf < todayIso()" class="text-sm text-muted-foreground">{{ t('reports.registry.historicalStatusNotice') }}</p>

    <Card class="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4" :aria-busy="!summary && !summaryError">
      <ReportKpiSkeleton v-if="!summary && !summaryError" :count="4" />
      <p v-else-if="summaryError" class="col-span-full flex min-h-10 items-center text-sm text-destructive">{{ summaryError }}</p>
      <template v-else-if="summary">
      <ReportKpiTile
        :icon="CircleCheck"
        bg-class="bg-emerald-100 dark:bg-emerald-500/15"
        icon-class="text-emerald-600 dark:text-emerald-400"
        :label="t('reports.registry.kpiActive')"
        :value="String(summary.active)"
      />
      <ReportKpiTile
        :icon="Clock"
        bg-class="bg-orange-100 dark:bg-orange-500/15"
        icon-class="text-orange-600 dark:text-orange-400"
        :label="t('reports.registry.kpiExpiring30')"
        :value="String(summary.expiring30)"
      />
      <ReportKpiTile
        :icon="AlertTriangle"
        bg-class="bg-red-100 dark:bg-red-500/15"
        icon-class="text-red-600 dark:text-red-400"
        :label="t('reports.registry.kpiOverdue')"
        :value="String(summary.overdue)"
      />
      <ReportKpiTile
        :icon="CircleX"
        bg-class="bg-muted"
        icon-class="text-muted-foreground"
        :label="t('reports.registry.kpiEnded')"
        :value="String(summary.ended)"
      />
      </template>
    </Card>

    <EntityTable
      ref="entityTable"
      :columns="columns"
      :column-labels="columnLabels"
      :filterable-fields="filterableFields"
      :default-sort="{ id: 'endDate', desc: false }"
      :fetch-page="fetchPage"
      :fetch-facet-values="fetchContractsRegistryFacets"
      :get-row-id="(c: ContractRegistryRow) => String(c.contractId)"
      :total-label="t('reports.common.totalContracts')"
      :cell-text="cellText"
      :cell-renderers="cellRenderers"
      :default-filters="initialFilters"
      storage-key="reports-contracts-registry"
      accent-icons
    >
      <template #actions>
        <span class="text-sm text-muted-foreground">{{ t('reports.common.asOf') }}</span>
        <DatePickerField v-model="asOf" />
        <Tooltip>
          <TooltipTrigger as-child>
            <Button size="icon" :loading="isExporting" @click="onExport">
              <Download />
              <span class="sr-only">{{ t('reports.common.exportExcel') }}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{{ t('reports.common.exportExcel') }}</TooltipContent>
        </Tooltip>
      </template>
    </EntityTable>
    <p v-if="exportError" class="text-sm text-red-500">{{ exportError }}</p>
  </div>
</template>
