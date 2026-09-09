<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ArrowLeft, Check, List, RotateCw, Search, Send, TriangleAlert } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogDescription, DialogFooter, DialogScrollContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import EntityTable from '@/components/EntityTable.vue'
import WebsitePaymentStatusPillCell from '@/components/WebsitePaymentStatusPillCell.vue'
import ServiceProvisionPeriodCell from '@/components/ServiceProvisionPeriodCell.vue'
import { createAppColumnHelper } from '@/lib/table'
import { createClientFetchPage, createClientFacetValues } from '@/lib/client-list'
import { goBack } from '@/lib/utils'
import { dateLocaleTag } from '@/lib/format-locale'
import type { Accounting1cSyncStatus } from '@/lib/payment-imports-api'
import {
  fetchServiceProvisionDocuments,
  fetchServiceProvisionDocumentDetail,
  recalculateServiceProvisionDocuments,
  sendServiceProvisionDocuments,
  type ServiceProvisionDocumentDetail,
  type ServiceProvisionType,
} from '@/lib/service-provision-api'

const router = useRouter()
const { t } = useI18n()

// Список читает уже сохранённые документы. Планировщик обновляет текущий месяц ежедневно,
// а сотрудник может отдельно пересчитать или отправить любые выбранные строки.

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
  unmatchedContractCount: number
  status: Accounting1cSyncStatus
  // Самый свежий periodStart среди загруженных документов — визуально выделяется в
  // таблице (см. ServiceProvisionPeriodCell.vue), по прямой просьбе 2026-09-04.
  isCurrent: boolean
}

const docs = ref<TableRow[]>([])
const selectedDocs = ref<TableRow[]>([])
const loadError = ref('')
const actionMessage = ref('')
const tableRef = ref<{ refresh: () => void | Promise<void> } | null>(null)
const currentUnmatchedCount = computed(() =>
  docs.value.filter((row) => row.isCurrent).reduce((total, row) => total + row.unmatchedContractCount, 0),
)

async function loadDocs() {
  loadError.value = ''
  try {
    const rows = await fetchServiceProvisionDocuments()
    const latestPeriod = rows.reduce<string | null>((max, r) => (!max || r.periodStart > max ? r.periodStart : max), null)
    docs.value = rows.map((d) => ({
      id: d.id,
      periodStart: d.periodStart,
      type: d.type,
      documentSumm: d.documentSumm,
      contractCount: d.contractCount,
      unmatchedContractCount: d.unmatchedContractCount,
      status: d.accounting1cSyncStatus,
      isCurrent: d.periodStart === latestPeriod,
    }))
    // EntityTable сам подгружает данные один раз в onMounted и дальше реагирует только на
    // смену страницы/сортировки/поиска/фильтра (см. EntityTable.vue) — источник (docs)
    // ему не известен как зависимость. Без явного refresh() тут первый заход на страницу
    // показывал бы пустую таблицу до первого клика по сортировке/фильтру (этот же fetch
    // ещё не мог успеть отработать раньше onMounted самой EntityTable — сетевой запрос
    // всегда медленнее синхронного монтирования).
    await tableRef.value?.refresh()
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
  unmatchedContractCount: t('serviceProvisionDocuments.colAccounting1cMatch'),
  status: t('serviceProvisionDocuments.colStatus'),
}))
function cellText(columnId: string, value: unknown): string {
  if (columnId === 'periodStart' && typeof value === 'string') return formatPeriod(value)
  if (columnId === 'type') return TYPE_LABELS[value as ServiceProvisionType] ?? String(value)
  if (columnId === 'documentSumm' && typeof value === 'number') return formatMoney(value)
  if (columnId === 'unmatchedContractCount' && typeof value === 'number') {
    return value === 0 ? t('serviceProvisionDocuments.allMatched') : t('serviceProvisionDocuments.unmatchedCount', { count: value })
  }
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
    columnHelper.accessor('unmatchedContractCount', { header: columnLabels.value.unmatchedContractCount, size: 170, minSize: 140 }),
    columnHelper.accessor('status', { header: columnLabels.value.status, size: 170, minSize: 140 }),
  ]),
)
const fetchPage = createClientFetchPage<TableRow>(() => docs.value, {
  searchText: (row) => `${TYPE_LABELS[row.type]} ${formatPeriod(row.periodStart)}`,
  sortValue: (row, sortBy) => (row as unknown as Record<string, string | number>)[sortBy] ?? '',
  filterValue: (row, field) => (field === 'status' ? row.status : field === 'type' ? row.type : ''),
})
const fetchFacetValues = createClientFacetValues<TableRow>(
  () => docs.value,
  (row, field) => (field === 'status' ? row.status : field === 'type' ? row.type : ''),
  (field, value) => (field === 'type' ? (TYPE_LABELS[value as ServiceProvisionType] ?? value) : (STATUS_LABELS[value as Accounting1cSyncStatus] ?? value)),
)

const isRecalculating = ref(false)
const isSending = ref(false)
const sendConfirmationOpen = ref(false)
const pendingSendDocs = ref<TableRow[]>([])

async function recalculateSelected() {
  if (selectedDocs.value.length === 0) return
  isRecalculating.value = true
  actionMessage.value = ''
  loadError.value = ''
  try {
    const result = await recalculateServiceProvisionDocuments(selectedDocs.value.map((row) => row.id))
    actionMessage.value = t('serviceProvisionDocuments.recalculateResult', { count: result.recalculated })
    await loadDocs()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isRecalculating.value = false
  }
}

function openSendConfirmation() {
  if (selectedDocs.value.length === 0) return
  pendingSendDocs.value = [...selectedDocs.value]
  sendConfirmationOpen.value = true
}

async function confirmSend() {
  if (pendingSendDocs.value.length === 0) return
  isSending.value = true
  actionMessage.value = ''
  loadError.value = ''
  try {
    const result = await sendServiceProvisionDocuments(pendingSendDocs.value.map((row) => row.id))
    actionMessage.value = t('serviceProvisionDocuments.sendResult', {
      succeeded: result.succeeded,
      failed: result.failed,
      blocked: result.blocked,
    })
    sendConfirmationOpen.value = false
    pendingSendDocs.value = []
    await loadDocs()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isSending.value = false
  }
}

// --- Детализация одного документа — какие договоры и на какую сумму в него вошли ---
const detailOpen = ref(false)
const detailLoading = ref(false)
const detailError = ref('')
const detailDoc = ref<ServiceProvisionDocumentDetail | null>(null)
const detailSearch = ref('')

async function openDetail(row: TableRow) {
  detailOpen.value = true
  detailLoading.value = true
  detailError.value = ''
  detailDoc.value = null
  detailSearch.value = ''
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
const filteredDetailLines = computed(() => {
  const query = detailSearch.value.trim().toLocaleLowerCase()
  if (!detailDoc.value) return []
  if (!query) return detailDoc.value.lines
  return detailDoc.value.lines.filter((line) =>
    `${line.contractNumber ?? ''} ${line.residentFullName ?? ''}`.toLocaleLowerCase().includes(query),
  )
})

function matchLabel(missingMappings: ('CONTRACTOR' | 'CONTRACT')[]): string {
  if (missingMappings.length === 0) return t('serviceProvisionDocuments.matched')
  if (missingMappings.length === 2) return t('serviceProvisionDocuments.missingBoth')
  return missingMappings[0] === 'CONTRACTOR'
    ? t('serviceProvisionDocuments.missingContractor')
    : t('serviceProvisionDocuments.missingContract')
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
    <p v-else-if="actionMessage" class="text-sm text-emerald-600">{{ actionMessage }}</p>
    <p v-else-if="currentUnmatchedCount > 0" class="text-sm text-amber-600">
      {{ t('serviceProvisionDocuments.unmatchedWarning', { count: currentUnmatchedCount }) }}
    </p>

    <EntityTable
      ref="tableRef"
      v-model:selected="selectedDocs"
      selectable
      :columns="columns"
      :column-labels="columnLabels"
      :filterable-fields="['type', 'status']"
      :default-sort="{ id: 'periodStart', desc: true }"
      :fetch-page="fetchPage"
      :fetch-facet-values="fetchFacetValues"
      :get-row-id="(r: TableRow) => String(r.id)"
      :total-label="t('serviceProvisionDocuments.title')"
      :cell-text="cellText"
      :cell-renderers="{ periodStart: ServiceProvisionPeriodCell, status: WebsitePaymentStatusPillCell }"
      :row-action="{ icon: List, label: t('serviceProvisionDocuments.viewDetails'), onClick: openDetail }"
      accent-icons
    >
      <template #actions>
        <Button
          size="sm"
          variant="outline"
          :disabled="selectedDocs.length === 0 || isSending"
          :loading="isRecalculating"
          @click="recalculateSelected"
        >
          <RotateCw class="size-4" />
          {{ t('serviceProvisionDocuments.recalculateButton', { count: selectedDocs.length }) }}
        </Button>
        <Button
          size="sm"
          :disabled="selectedDocs.length === 0 || isRecalculating"
          @click="openSendConfirmation"
        >
          <Send class="size-4" />
          {{ t('serviceProvisionDocuments.sendButton', { count: selectedDocs.length }) }}
        </Button>
      </template>
    </EntityTable>

    <Dialog :open="detailOpen" @update:open="(open) => (detailOpen = open)">
      <DialogScrollContent class="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-6xl flex-col gap-4">
        <DialogHeader>
          <DialogTitle>{{ detailTitle }}</DialogTitle>
        </DialogHeader>

        <p v-if="detailLoading" class="text-sm text-muted-foreground">…</p>
        <p v-else-if="detailError" class="text-sm text-red-500">{{ detailError }}</p>
        <div v-else-if="detailDoc" class="flex flex-col gap-2">
          <div class="relative">
            <Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              v-model="detailSearch"
              class="pl-9"
              :placeholder="t('serviceProvisionDocuments.detailSearchPlaceholder')"
            />
          </div>
          <div class="max-h-[55vh] overflow-y-auto rounded-md border">
            <table class="w-full text-sm">
              <thead class="sticky top-0 bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th class="px-3 py-2 text-left font-medium">{{ t('serviceProvisionDocuments.colContractNumber') }}</th>
                  <th class="px-3 py-2 text-left font-medium">{{ t('serviceProvisionDocuments.colResident') }}</th>
                  <th class="px-3 py-2 text-left font-medium">{{ t('serviceProvisionDocuments.colAccounting1cMatch') }}</th>
                  <th class="px-3 py-2 text-right font-medium">{{ t('serviceProvisionDocuments.colAmount') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(line, i) in filteredDetailLines" :key="`${line.contractId ?? 'old'}-${i}`" class="border-t">
                  <td class="px-3 py-2">
                    <RouterLink
                      v-if="line.contractId && line.contractNumber"
                      :to="{ name: 'contract-detail', params: { id: line.contractId } }"
                      class="font-medium text-primary hover:underline"
                    >
                      №{{ line.contractNumber }}
                    </RouterLink>
                    <span v-else>{{ line.contractNumber ? `№${line.contractNumber}` : t('serviceProvisionDocuments.unknownContract') }}</span>
                  </td>
                  <td class="px-3 py-2">
                    <RouterLink
                      v-if="line.residentIndividualUid && line.residentFullName"
                      :to="{ name: 'individual-detail', params: { uid: line.residentIndividualUid } }"
                      class="font-medium text-primary hover:underline"
                    >
                      {{ line.residentFullName }}
                    </RouterLink>
                    <span v-else>{{ line.residentFullName ?? '—' }}</span>
                  </td>
                  <td class="px-3 py-2">
                    <span
                      class="inline-flex items-center gap-1 text-xs"
                      :class="line.accounting1cMatched ? 'text-emerald-600' : 'text-amber-600'"
                    >
                      <Check v-if="line.accounting1cMatched" class="size-3.5" />
                      <TriangleAlert v-else class="size-3.5" />
                      {{ matchLabel(line.missingMappings) }}
                    </span>
                  </td>
                  <td class="px-3 py-2 text-right">{{ formatMoney(line.amount) }}</td>
                </tr>
                <tr v-if="filteredDetailLines.length === 0">
                  <td colspan="4" class="px-3 py-8 text-center text-muted-foreground">
                    {{ t('serviceProvisionDocuments.noSearchResults') }}
                  </td>
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

    <Dialog :open="sendConfirmationOpen" @update:open="(open) => !isSending && (sendConfirmationOpen = open)">
      <DialogScrollContent class="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{{ t('serviceProvisionDocuments.sendConfirmTitle') }}</DialogTitle>
          <DialogDescription>{{ t('serviceProvisionDocuments.sendConfirmDescription') }}</DialogDescription>
        </DialogHeader>
        <div class="max-h-80 overflow-y-auto rounded-md border">
          <table class="w-full text-sm">
            <thead class="sticky top-0 bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th class="px-3 py-2 text-left font-medium">{{ t('serviceProvisionDocuments.colPeriod') }}</th>
                <th class="px-3 py-2 text-left font-medium">{{ t('serviceProvisionDocuments.colType') }}</th>
                <th class="px-3 py-2 text-right font-medium">{{ t('serviceProvisionDocuments.colAmount') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in pendingSendDocs" :key="row.id" class="border-t">
                <td class="px-3 py-2">{{ formatPeriod(row.periodStart) }}</td>
                <td class="px-3 py-2">{{ TYPE_LABELS[row.type] }}</td>
                <td class="px-3 py-2 text-right font-medium">{{ formatMoney(row.documentSumm) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <DialogFooter>
          <Button variant="outline" :disabled="isSending" @click="sendConfirmationOpen = false">
            {{ t('serviceProvisionDocuments.cancel') }}
          </Button>
          <Button :loading="isSending" @click="confirmSend">
            <Send class="size-4" />
            {{ t('serviceProvisionDocuments.confirmSend') }}
          </Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>
  </div>
</template>
