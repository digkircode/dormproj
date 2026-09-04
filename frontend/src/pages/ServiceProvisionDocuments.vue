<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ArrowLeft, RotateCw } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import EntityTable from '@/components/EntityTable.vue'
import WebsitePaymentStatusPillCell from '@/components/WebsitePaymentStatusPillCell.vue'
import { createAppColumnHelper } from '@/lib/table'
import { createClientFetchPage, createClientFacetValues } from '@/lib/client-list'
import { goBack } from '@/lib/utils'
import { dateLocaleTag } from '@/lib/format-locale'
import type { Accounting1cSyncStatus } from '@/lib/payment-imports-api'
import {
  fetchServiceProvisionDocuments,
  runServiceProvisionDocuments,
  type ServiceProvisionDocumentRow,
  type ServiceProvisionType,
} from '@/lib/service-provision-api'

const router = useRouter()
const { t } = useI18n()

// Флоу 3 (см. промпт проекта) — только чтение + ручной повтор, своего одобрения/правки
// нет: оба документа ("Найм"/"Коммуналка") собираются автоматически из начислений за уже
// закончившийся месяц, сотрудник ничего тут не вводит.

function formatMoney(value: number): string {
  return `${value.toLocaleString(dateLocaleTag(), { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`
}
function formatPeriod(value: string): string {
  return new Date(value).toLocaleDateString(dateLocaleTag(), { month: 'long', year: 'numeric' })
}

const STATUS_LABELS: Record<Accounting1cSyncStatus, string> = {
  NOT_SYNCED: t('paymentImports.statusWebsite.NOT_SYNCED'),
  SYNCED: t('paymentImports.statusWebsite.SYNCED'),
  FAILED: t('paymentImports.statusWebsite.FAILED'),
}
const TYPE_LABELS: Record<ServiceProvisionType, string> = {
  RENT: t('serviceProvisionDocuments.type.RENT'),
  UTILITIES: t('serviceProvisionDocuments.type.UTILITIES'),
}

const docs = ref<ServiceProvisionDocumentRow[]>([])
const loadError = ref('')
async function loadDocs() {
  loadError.value = ''
  try {
    docs.value = await fetchServiceProvisionDocuments()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  }
}
loadDocs()

const columnLabels = computed<Record<string, string>>(() => ({
  periodStart: t('serviceProvisionDocuments.colPeriod'),
  type: t('serviceProvisionDocuments.colType'),
  documentSumm: t('serviceProvisionDocuments.colAmount'),
  contractCount: t('serviceProvisionDocuments.colContractCount'),
  status: t('serviceProvisionDocuments.colStatus'),
}))
function cellText(columnId: string, value: unknown): string {
  if (columnId === 'periodStart' && typeof value === 'string') return formatPeriod(value)
  if (columnId === 'type') return TYPE_LABELS[value as ServiceProvisionType] ?? String(value)
  if (columnId === 'documentSumm' && typeof value === 'number') return formatMoney(value)
  if (columnId === 'status') return STATUS_LABELS[value as Accounting1cSyncStatus] ?? String(value)
  return String(value ?? '—')
}

interface TableRow {
  id: number
  periodStart: string
  type: ServiceProvisionType
  documentSumm: number
  contractCount: number
  status: Accounting1cSyncStatus
}
const tableRows = computed<TableRow[]>(() =>
  docs.value.map((d) => ({
    id: d.id,
    periodStart: d.periodStart,
    type: d.type,
    documentSumm: d.documentSumm,
    contractCount: d.contractCount,
    status: d.accounting1cSyncStatus,
  })),
)

const columnHelper = createAppColumnHelper<TableRow>()
const columns = computed(() =>
  columnHelper.columns([
    columnHelper.accessor('periodStart', { header: columnLabels.value.periodStart, size: 160, minSize: 130 }),
    columnHelper.accessor('type', { header: columnLabels.value.type, enableSorting: false, size: 140, minSize: 110 }),
    columnHelper.accessor('documentSumm', { header: columnLabels.value.documentSumm, size: 140, minSize: 110 }),
    columnHelper.accessor('contractCount', { header: columnLabels.value.contractCount, enableSorting: false, size: 120, minSize: 100 }),
    columnHelper.accessor('status', { header: columnLabels.value.status, size: 170, minSize: 140 }),
  ]),
)
const fetchPage = createClientFetchPage<TableRow>(() => tableRows.value, {
  searchText: (row) => TYPE_LABELS[row.type],
  sortValue: (row, sortBy) => (row as unknown as Record<string, string | number>)[sortBy] ?? '',
  filterValue: (row, field) => (field === 'status' ? row.status : field === 'type' ? row.type : ''),
})
const fetchFacetValues = createClientFacetValues<TableRow>(
  () => tableRows.value,
  (row, field) => (field === 'status' ? row.status : field === 'type' ? row.type : ''),
  (field, value) => (field === 'type' ? (TYPE_LABELS[value as ServiceProvisionType] ?? value) : (STATUS_LABELS[value as Accounting1cSyncStatus] ?? value)),
)

const tableRef = ref<{ refresh: () => void | Promise<void> } | null>(null)
const isRunning = ref(false)
const runMessage = ref('')
const runError = ref('')
async function runNow() {
  isRunning.value = true
  runMessage.value = ''
  runError.value = ''
  try {
    const result = await runServiceProvisionDocuments()
    runMessage.value = result.skipped
      ? t('serviceProvisionDocuments.runSkipped')
      : t('serviceProvisionDocuments.runResult', { pushed: result.pushed, succeeded: result.succeeded, failed: result.failed })
    await loadDocs()
    await tableRef.value?.refresh()
  } catch (error) {
    runError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isRunning.value = false
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/')">
        <ArrowLeft class="text-primary" />
        <span class="sr-only">{{ t('serviceProvisionDocuments.title') }}</span>
      </Button>
      <h1 class="text-lg font-medium">{{ t('serviceProvisionDocuments.title') }}</h1>
    </div>

    <p v-if="loadError" class="text-sm text-red-500">{{ loadError }}</p>

    <EntityTable
      ref="tableRef"
      :columns="columns"
      :column-labels="columnLabels"
      :filterable-fields="['type', 'status']"
      :default-sort="{ id: 'periodStart', desc: true }"
      :fetch-page="fetchPage"
      :fetch-facet-values="fetchFacetValues"
      :get-row-id="(r: TableRow) => String(r.id)"
      :total-label="t('serviceProvisionDocuments.title')"
      :cell-text="cellText"
      :cell-renderers="{ status: WebsitePaymentStatusPillCell }"
      accent-icons
    >
      <template #actions>
        <div class="flex flex-wrap items-center gap-2">
          <Button size="sm" :loading="isRunning" @click="runNow">
            <RotateCw class="size-4" />
            {{ t('serviceProvisionDocuments.runButton') }}
          </Button>
          <p v-if="runMessage" class="text-sm text-muted-foreground">{{ runMessage }}</p>
          <p v-if="runError" class="text-sm text-red-500">{{ runError }}</p>
        </div>
      </template>
    </EntityTable>
  </div>
</template>
