<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ArrowLeft, List, RotateCw } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import EntityTable from '@/components/EntityTable.vue'
import WebsitePaymentStatusPillCell from '@/components/WebsitePaymentStatusPillCell.vue'
import { createAppColumnHelper } from '@/lib/table'
import { createClientFetchPage, createClientFacetValues } from '@/lib/client-list'
import { goBack } from '@/lib/utils'
import { dateLocaleTag } from '@/lib/format-locale'
import type { Accounting1cSyncStatus } from '@/lib/payment-imports-api'
import {
  fetchServiceProvisionDocuments,
  fetchServiceProvisionDocumentDetail,
  runServiceProvisionDocuments,
  type ServiceProvisionDocumentDetail,
  type ServiceProvisionType,
} from '@/lib/service-provision-api'

const router = useRouter()
const { t } = useI18n()

// Флоу 3 (см. промпт проекта) — своего одобрения/правки нет: оба документа ("Найм"/
// "Коммуналка") за уже закончившийся месяц считаются автоматически из начислений (тот же
// подсчёт, что и у ночного крона), список виден сразу при заходе на страницу — GET
// /service-provision-documents сам пересчитывает и сохраняет актуальные строки, ждать
// нажатия кнопки для этого не нужно. Кнопка "Отправить в 1С" — только про саму отправку
// уже посчитанных сумм, статус отправки виден в столбце "Статус" у каждой строки.

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

interface TableRow {
  id: number
  periodStart: string
  type: ServiceProvisionType
  documentSumm: number
  contractCount: number
  status: Accounting1cSyncStatus
}

const docs = ref<TableRow[]>([])
const loadError = ref('')
async function loadDocs() {
  loadError.value = ''
  try {
    const rows = await fetchServiceProvisionDocuments()
    docs.value = rows.map((d) => ({
      id: d.id,
      periodStart: d.periodStart,
      type: d.type,
      documentSumm: d.documentSumm,
      contractCount: d.contractCount,
      status: d.accounting1cSyncStatus,
    }))
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
const fetchPage = createClientFetchPage<TableRow>(() => docs.value, {
  searchText: (row) => TYPE_LABELS[row.type],
  sortValue: (row, sortBy) => (row as unknown as Record<string, string | number>)[sortBy] ?? '',
  filterValue: (row, field) => (field === 'status' ? row.status : field === 'type' ? row.type : ''),
})
const fetchFacetValues = createClientFacetValues<TableRow>(
  () => docs.value,
  (row, field) => (field === 'status' ? row.status : field === 'type' ? row.type : ''),
  (field, value) => (field === 'type' ? (TYPE_LABELS[value as ServiceProvisionType] ?? value) : (STATUS_LABELS[value as Accounting1cSyncStatus] ?? value)),
)

const tableRef = ref<{ refresh: () => void | Promise<void> } | null>(null)
const isRunning = ref(false)
async function runNow() {
  isRunning.value = true
  loadError.value = ''
  try {
    await runServiceProvisionDocuments()
    await loadDocs()
    await tableRef.value?.refresh()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isRunning.value = false
  }
}

// --- Детализация одного документа — какие договоры и на какую сумму в него вошли ---
const detailOpen = ref(false)
const detailLoading = ref(false)
const detailError = ref('')
const detailDoc = ref<ServiceProvisionDocumentDetail | null>(null)

async function openDetail(row: TableRow) {
  detailOpen.value = true
  detailLoading.value = true
  detailError.value = ''
  detailDoc.value = null
  try {
    detailDoc.value = await fetchServiceProvisionDocumentDetail(row.id)
  } catch (error) {
    detailError.value = error instanceof Error ? error.message : String(error)
  } finally {
    detailLoading.value = false
  }
}
const detailTitle = computed(() => {
  if (!detailDoc.value) return ''
  return t('serviceProvisionDocuments.detailDialogTitle', {
    type: TYPE_LABELS[detailDoc.value.type],
    period: formatPeriod(detailDoc.value.periodStart),
  })
})
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
      :row-action="{ icon: List, label: t('serviceProvisionDocuments.viewDetails'), onClick: openDetail }"
      accent-icons
    >
      <template #actions>
        <Button size="sm" :loading="isRunning" @click="runNow">
          <RotateCw class="size-4" />
          {{ t('serviceProvisionDocuments.runButton') }}
        </Button>
      </template>
    </EntityTable>

    <Dialog :open="detailOpen" @update:open="(open) => (detailOpen = open)">
      <DialogScrollContent class="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>{{ detailTitle }}</DialogTitle>
        </DialogHeader>

        <p v-if="detailLoading" class="text-sm text-muted-foreground">…</p>
        <p v-else-if="detailError" class="text-sm text-red-500">{{ detailError }}</p>
        <div v-else-if="detailDoc" class="flex flex-col gap-2">
          <div class="max-h-96 overflow-y-auto rounded-md border">
            <table class="w-full text-sm">
              <thead class="sticky top-0 bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th class="px-3 py-2 text-left font-medium">{{ t('serviceProvisionDocuments.colContractNumber') }}</th>
                  <th class="px-3 py-2 text-left font-medium">{{ t('serviceProvisionDocuments.colResident') }}</th>
                  <th class="px-3 py-2 text-right font-medium">{{ t('serviceProvisionDocuments.colAmount') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(line, i) in detailDoc.lines" :key="i" class="border-t">
                  <td class="px-3 py-2">{{ line.contractNumber ? `№${line.contractNumber}` : t('serviceProvisionDocuments.unknownContract') }}</td>
                  <td class="px-3 py-2">{{ line.residentFullName ?? '—' }}</td>
                  <td class="px-3 py-2 text-right">{{ formatMoney(line.amount) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="flex items-center justify-between px-1 text-sm font-medium">
            <span>{{ t('serviceProvisionDocuments.total') }} ({{ detailDoc.lines.length }})</span>
            <span>{{ formatMoney(detailDoc.documentSumm) }}</span>
          </div>
        </div>
      </DialogScrollContent>
    </Dialog>
  </div>
</template>
