<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, ArrowRightLeft, Download, LogIn, LogOut, Repeat } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import EntityTable from '@/components/EntityTable.vue'
import ContractLinkCell from '@/components/ContractLinkCell.vue'
import ResidentLinkCell from '@/components/ResidentLinkCell.vue'
import MovementOperationCell from '@/components/MovementOperationCell.vue'
import DateRangePickerField from '@/components/DateRangePickerField.vue'
import ReportKpiTile from '@/components/ReportKpiTile.vue'
import { createAppColumnHelper } from '@/lib/table'
import {
  fetchMovementsPage,
  fetchMovementsFacets,
  fetchMovementsSummary,
  exportMovementsExcel,
  type MovementEvent,
  type MovementsSummary,
  type ListOptions,
} from '@/lib/reports-api'
import { goBack } from '@/lib/utils'

const router = useRouter()

const columnLabels: Record<string, string> = {
  date: 'Дата операции',
  contractNumber: '№ договора',
  residentFullName: 'Проживающий',
  operation: 'Операция',
  from: 'Откуда',
  to: 'Куда',
}
const filterableFields = ['operation']
const cellRenderers = { contractNumber: ContractLinkCell, residentFullName: ResidentLinkCell, operation: MovementOperationCell }

function formatDateIso(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
}
function cellText(columnId: string, value: unknown): string {
  if (columnId === 'date' && typeof value === 'string') return formatDateIso(value)
  if (columnId === 'from' || columnId === 'to') return typeof value === 'string' ? value : '—'
  return String(value ?? '')
}

const columnHelper = createAppColumnHelper<MovementEvent>()
const columns = columnHelper.columns([
  columnHelper.accessor('date', { header: columnLabels.date, enableHiding: false, size: 120, minSize: 100 }),
  columnHelper.accessor('contractNumber', { header: columnLabels.contractNumber, size: 128, minSize: 100 }),
  columnHelper.accessor('residentFullName', { header: columnLabels.residentFullName, size: 220, minSize: 160 }),
  columnHelper.accessor('operation', { header: columnLabels.operation, size: 140, minSize: 120 }),
  columnHelper.accessor('from', { header: columnLabels.from, size: 110, minSize: 90 }),
  columnHelper.accessor('to', { header: columnLabels.to, size: 110, minSize: 90 }),
])

function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}

// Дата начала периода пустая по умолчанию — тогда отчёт показывает всё "на дату
// окончания" (без нижней границы, см. reports.controller.ts), не последний месяц.
const from = ref('')
const to = ref(isoToday())

function fetchPage(options: ListOptions) {
  return fetchMovementsPage(options, from.value, to.value)
}

const summary = ref<MovementsSummary | null>(null)
async function loadSummary() {
  if (!to.value) return
  summary.value = await fetchMovementsSummary(from.value, to.value)
}

const entityTable = ref<{ refresh: () => void } | null>(null)
watch([from, to], () => {
  loadSummary()
  entityTable.value?.refresh()
})
onMounted(loadSummary)

const isExporting = ref(false)
const exportError = ref('')
async function onExport() {
  exportError.value = ''
  isExporting.value = true
  try {
    await exportMovementsExcel(from.value, to.value)
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
        <span class="sr-only">Назад</span>
      </Button>
      <h1 class="text-lg font-medium">Движение проживающих</h1>
    </div>

    <Card v-if="summary" class="grid grid-cols-4 gap-4 p-4">
      <ReportKpiTile
        :icon="LogIn"
        bg-class="bg-emerald-100 dark:bg-emerald-500/15"
        icon-class="text-emerald-600 dark:text-emerald-400"
        label="Заселено"
        :value="String(summary.movedIn)"
      />
      <ReportKpiTile
        :icon="LogOut"
        bg-class="bg-red-100 dark:bg-red-500/15"
        icon-class="text-red-600 dark:text-red-400"
        label="Выселено"
        :value="String(summary.movedOut)"
      />
      <ReportKpiTile
        :icon="ArrowRightLeft"
        bg-class="bg-orange-100 dark:bg-orange-500/15"
        icon-class="text-orange-600 dark:text-orange-400"
        label="Переселено"
        :value="String(summary.relocated)"
      />
      <ReportKpiTile
        :icon="Repeat"
        bg-class="bg-sky-100 dark:bg-sky-500/15"
        icon-class="text-sky-600 dark:text-sky-400"
        label="Продлено"
        :value="String(summary.renewed)"
      />
    </Card>

    <EntityTable
      ref="entityTable"
      :columns="columns"
      :column-labels="columnLabels"
      :filterable-fields="filterableFields"
      :default-sort="{ id: 'date', desc: true }"
      :fetch-page="fetchPage"
      :fetch-facet-values="fetchMovementsFacets"
      :get-row-id="(e: MovementEvent) => `${e.contractId}-${e.operation}-${e.date}`"
      total-label="событий"
      :cell-text="cellText"
      :cell-renderers="cellRenderers"
      storage-key="reports-movements"
      accent-icons
    >
      <template #actions>
        <span class="text-sm text-muted-foreground">Период</span>
        <DateRangePickerField v-model:from="from" v-model:to="to" />
        <Button variant="outline" size="sm" :loading="isExporting" @click="onExport">
          <Download class="size-4" />
          Экспорт в Excel
        </Button>
      </template>
    </EntityTable>
    <p v-if="exportError" class="text-sm text-red-500">{{ exportError }}</p>
  </div>
</template>
