<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ArrowLeft, Check, MoreHorizontal, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import EntityTable from '@/components/EntityTable.vue'
import SearchSelect from '@/components/SearchSelect.vue'
import DatePickerField from '@/components/DatePickerField.vue'
import { createAppColumnHelper } from '@/lib/table'
import { createClientFetchPage, createClientFacetValues } from '@/lib/client-list'
import { goBack } from '@/lib/utils'
import { dateLocaleTag } from '@/lib/format-locale'
import {
  fetchPaymentImportsPage,
  fetchPaymentImportDetail,
  fetchWebsitePayments,
  approvePaymentImport,
  rejectPaymentImport,
  type PaymentImportRow,
  type PaymentImportDetail,
  type WebsitePaymentRow,
} from '@/lib/payment-imports-api'
import { syncPaymentToAccounting1c } from '@/lib/billing-api'
import { fetchContractsPage, type ContractListItem } from '@/lib/contracts-api'
import type { PaymentMethod } from '@/lib/contracts-api'

const router = useRouter()
const { t } = useI18n()

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(dateLocaleTag())
}
function formatMoney(value: number | null): string {
  if (value === null) return '—'
  return `${value.toLocaleString(dateLocaleTag(), { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`
}

// --- Единый список: очередь одобрения из 1С (флоу 2) + наши WEBSITE-платежи со статусом
// отправки в 1С (флоу 1) — по прямой просьбе 2026-09-03, один общий обзор вместо двух
// разрозненных мест. Полностью грузится в память (объём пока небольшой) и режется на
// страницы/фильтруется клиентски, тот же приём, что у "объединённого леджера" в
// MyContract.vue (см. client-list.ts).
type UnifiedStatus = PaymentImportRow['status'] | WebsitePaymentRow['accounting1cSyncStatus']

interface UnifiedRow {
  rowId: string
  kind: 'import' | 'website'
  paidAt: string | null
  amount: number | null
  contractorFio: string | null
  purpose: string | null
  contractLabel: string
  status: UnifiedStatus
  raw: PaymentImportRow | WebsitePaymentRow
}

const STATUS_LABELS: Record<UnifiedStatus, string> = {
  IMPORTED: t('paymentImports.status.IMPORTED'),
  NEEDS_REVIEW: t('paymentImports.status.NEEDS_REVIEW'),
  MATCHED: t('paymentImports.status.MATCHED'),
  REJECTED: t('paymentImports.status.REJECTED'),
  NOT_SYNCED: t('paymentImports.statusWebsite.NOT_SYNCED'),
  SYNCED: t('paymentImports.statusWebsite.SYNCED'),
  FAILED: t('paymentImports.statusWebsite.FAILED'),
}
const ACTIONABLE_IMPORT_STATUSES = new Set(['IMPORTED', 'NEEDS_REVIEW'])

const importRows = ref<PaymentImportRow[]>([])
const websiteRows = ref<WebsitePaymentRow[]>([])
const loadError = ref('')

async function loadAll() {
  loadError.value = ''
  try {
    const [importsPage, website] = await Promise.all([
      fetchPaymentImportsPage({ page: 1, pageSize: 500, search: '', sortBy: 'importedAt', sortDir: 'desc', filters: {} }),
      fetchWebsitePayments(),
    ])
    importRows.value = importsPage.data
    websiteRows.value = website
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  }
}
loadAll()

const unifiedRows = computed<UnifiedRow[]>(() => {
  const fromImports: UnifiedRow[] = importRows.value.map((row) => ({
    rowId: `import-${row.id}`,
    kind: 'import',
    paidAt: row.paidAt,
    amount: row.amount,
    contractorFio: row.contractorFio,
    purpose: row.comment,
    contractLabel: row.matchedContract
      ? `№${row.matchedContract.number}`
      : row.suggestedContract
        ? `№${row.suggestedContract.number} — ${row.suggestedContract.residentFullName}`
        : t('paymentImports.noSuggestion'),
    status: row.status,
    raw: row,
  }))
  const fromWebsite: UnifiedRow[] = websiteRows.value.map((row) => ({
    rowId: `website-${row.id}`,
    kind: 'website',
    paidAt: row.paidAt,
    amount: row.amount,
    contractorFio: row.contractorFio,
    purpose: row.purpose,
    contractLabel: `№${row.contract.number}`,
    status: row.accounting1cSyncStatus,
    raw: row,
  }))
  return [...fromImports, ...fromWebsite]
})

const columnLabels = computed<Record<string, string>>(() => ({
  paidAt: t('paymentImports.colDate'),
  amount: t('paymentImports.colAmount'),
  contractorFio: t('paymentImports.colPayer'),
  purpose: t('paymentImports.colComment'),
  contractLabel: t('paymentImports.colSuggestedContract'),
  status: t('paymentImports.colStatus'),
}))
const filterableFields = ['status']
function cellText(columnId: string, value: unknown): string {
  if (columnId === 'paidAt' && typeof value === 'string') return formatDate(value)
  if (columnId === 'amount' && typeof value === 'number') return formatMoney(value)
  if (columnId === 'status') return STATUS_LABELS[value as UnifiedStatus] ?? String(value)
  return String(value ?? '—')
}

const columnHelper = createAppColumnHelper<UnifiedRow>()
const columns = computed(() =>
  columnHelper.columns([
    columnHelper.accessor('paidAt', { header: columnLabels.value.paidAt, size: 120, minSize: 100 }),
    columnHelper.accessor('amount', { header: columnLabels.value.amount, size: 110, minSize: 100 }),
    columnHelper.accessor('contractorFio', { header: columnLabels.value.contractorFio, size: 200, minSize: 160 }),
    columnHelper.accessor('purpose', { header: columnLabels.value.purpose, enableSorting: false, size: 280, minSize: 180 }),
    columnHelper.accessor('contractLabel', { header: columnLabels.value.contractLabel, enableSorting: false, size: 220, minSize: 160 }),
    columnHelper.accessor('status', { header: columnLabels.value.status, size: 170, minSize: 140 }),
  ]),
)

const fetchPage = createClientFetchPage<UnifiedRow>(() => unifiedRows.value, {
  searchText: (row) => `${row.contractorFio ?? ''} ${row.purpose ?? ''} ${row.contractLabel}`,
  sortValue: (row, sortBy) => (row as unknown as Record<string, string | number>)[sortBy] ?? '',
  filterValue: (row, field) => (field === 'status' ? row.status : ''),
})
const fetchFacetValues = createClientFacetValues<UnifiedRow>(
  () => unifiedRows.value,
  (row, field) => (field === 'status' ? row.status : ''),
  (_field, value) => STATUS_LABELS[value as UnifiedStatus] ?? value,
)

const tableRef = ref<{ refresh: () => void | Promise<void> } | null>(null)
async function refreshTable() {
  await loadAll()
  await tableRef.value?.refresh()
}

// --- Действие на строке: для 1С-импорта — открыть разбор, для сайтового платежа —
// сразу повторить отправку (без диалога, как кнопка в ContractDetail.vue). ---
const retryingWebsiteId = ref<number | null>(null)
async function handleRowAction(row: UnifiedRow) {
  if (row.kind === 'website') {
    const websiteRow = row.raw as WebsitePaymentRow
    retryingWebsiteId.value = websiteRow.id
    try {
      await syncPaymentToAccounting1c(websiteRow.id)
      await refreshTable()
    } finally {
      retryingWebsiteId.value = null
    }
    return
  }
  await openReview(row.raw as PaymentImportRow)
}

// --- Массовое одобрение (чекбоксы) ---
const selectedRows = ref<UnifiedRow[]>([])
const selectedImportRows = computed(() => selectedRows.value.filter((r): r is UnifiedRow & { raw: PaymentImportRow } => r.kind === 'import'))
const bulkApproveOpen = ref(false)
const bulkMethod = ref<PaymentMethod>('CASH')
const bulkError = ref('')
const isBulkApproving = ref(false)

function openBulkApprove() {
  bulkError.value = ''
  bulkMethod.value = 'CASH'
  bulkApproveOpen.value = true
}

const bulkApprovable = computed(() =>
  selectedImportRows.value.filter((r) => ACTIONABLE_IMPORT_STATUSES.has(r.raw.status) && r.raw.suggestedContract),
)
const bulkSkipped = computed(() => selectedImportRows.value.length - bulkApprovable.value.length)

async function submitBulkApprove() {
  isBulkApproving.value = true
  bulkError.value = ''
  try {
    for (const row of bulkApprovable.value) {
      await approvePaymentImport(row.raw.id, { contractId: row.raw.suggestedContract!.id, method: bulkMethod.value })
    }
    bulkApproveOpen.value = false
    selectedRows.value = []
    await refreshTable()
  } catch (error) {
    bulkError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isBulkApproving.value = false
  }
}

// --- Разбор одной записи из 1С (approve/reject) ---
const reviewOpen = ref(false)
const reviewDetail = ref<PaymentImportDetail | null>(null)
const reviewLoading = ref(false)
const reviewError = ref('')

const isPickingContract = ref(false)
const selectedContract = ref<ContractListItem | null>(null)
const contractQuery = ref('')
const contractOptions = ref<ContractListItem[]>([])
const contractSearchLoading = ref(false)
const paymentMethod = ref<PaymentMethod>('CASH')
const overrideAmount = ref<number | undefined>(undefined)
const overridePaidAt = ref('')
const isApproving = ref(false)
const isRejecting = ref(false)
const rejectReason = ref('')
const showRejectConfirm = ref(false)

async function searchContracts(query: string) {
  contractQuery.value = query
  if (!query.trim()) {
    contractOptions.value = []
    return
  }
  contractSearchLoading.value = true
  try {
    const page = await fetchContractsPage({ page: 1, pageSize: 10, search: query, sortBy: 'contractDate', sortDir: 'desc', filters: {} })
    contractOptions.value = page.data
  } finally {
    contractSearchLoading.value = false
  }
}
function pickContract(c: ContractListItem) {
  selectedContract.value = c
  contractQuery.value = `№${c.number} — ${c.residentFullName}`
  isPickingContract.value = false
}
function changeContract() {
  isPickingContract.value = true
  contractQuery.value = ''
  contractOptions.value = []
}

async function openReview(row: PaymentImportRow) {
  reviewOpen.value = true
  reviewLoading.value = true
  reviewError.value = ''
  reviewDetail.value = null
  selectedContract.value = null
  isPickingContract.value = false
  contractQuery.value = ''
  contractOptions.value = []
  paymentMethod.value = 'CASH'
  overrideAmount.value = undefined
  overridePaidAt.value = ''
  rejectReason.value = ''
  showRejectConfirm.value = false
  try {
    const detail = await fetchPaymentImportDetail(row.id)
    reviewDetail.value = detail
    if (detail.suggestedContract) {
      selectedContract.value = {
        id: detail.suggestedContract.id,
        number: detail.suggestedContract.number,
        residentFullName: detail.suggestedContract.residentFullName,
      } as ContractListItem
    } else {
      isPickingContract.value = true
    }
  } catch (error) {
    reviewError.value = error instanceof Error ? error.message : String(error)
  } finally {
    reviewLoading.value = false
  }
}

const isActionable = computed(() => reviewDetail.value?.status === 'IMPORTED' || reviewDetail.value?.status === 'NEEDS_REVIEW')

async function submitApprove() {
  if (!reviewDetail.value) return
  if (!selectedContract.value) {
    reviewError.value = t('paymentImports.errors.contractRequired')
    return
  }
  isApproving.value = true
  reviewError.value = ''
  try {
    await approvePaymentImport(reviewDetail.value.id, {
      contractId: selectedContract.value.id,
      method: paymentMethod.value,
      amount: overrideAmount.value,
      paidAt: overridePaidAt.value || undefined,
    })
    reviewOpen.value = false
    await refreshTable()
  } catch (error) {
    reviewError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isApproving.value = false
  }
}

async function submitReject() {
  if (!reviewDetail.value) return
  isRejecting.value = true
  reviewError.value = ''
  try {
    await rejectPaymentImport(reviewDetail.value.id, rejectReason.value)
    reviewOpen.value = false
    await refreshTable()
  } catch (error) {
    reviewError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isRejecting.value = false
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/contracts')">
        <ArrowLeft class="text-primary" />
        <span class="sr-only">{{ t('paymentImports.title') }}</span>
      </Button>
      <h1 class="text-lg font-medium">{{ t('paymentImports.title') }}</h1>
    </div>
    <p class="text-sm text-muted-foreground">{{ t('paymentImports.description') }}</p>
    <p v-if="loadError" class="text-sm text-red-500">{{ loadError }}</p>

    <EntityTable
      ref="tableRef"
      v-model:selected="selectedRows"
      :columns="columns"
      :column-labels="columnLabels"
      :filterable-fields="filterableFields"
      :default-sort="{ id: 'paidAt', desc: true }"
      :fetch-page="fetchPage"
      :fetch-facet-values="fetchFacetValues"
      :get-row-id="(r: UnifiedRow) => r.rowId"
      :total-label="t('paymentImports.title')"
      :cell-text="cellText"
      :row-action="{ icon: MoreHorizontal, label: t('paymentImports.approve'), onClick: handleRowAction }"
      selectable
      accent-icons
    >
      <template #actions>
        <Button v-if="selectedImportRows.length > 0" size="sm" @click="openBulkApprove">
          {{ t('paymentImports.bulkApprove', { count: selectedImportRows.length }) }}
        </Button>
      </template>
    </EntityTable>

    <!-- Массовое одобрение -->
    <Dialog :open="bulkApproveOpen" @update:open="(open) => (bulkApproveOpen = open)">
      <DialogScrollContent :class="['flex flex-col gap-4', DIALOG_ANIMATE_CLASS]">
        <DialogHeader>
          <DialogTitle>{{ t('paymentImports.bulkApproveDialogTitle') }}</DialogTitle>
        </DialogHeader>
        <ul class="flex max-h-48 flex-col gap-1 overflow-y-auto text-sm">
          <li v-for="row in bulkApprovable" :key="row.rowId">
            {{ formatMoney(row.amount) }} — {{ row.contractorFio }} → {{ row.contractLabel }}
          </li>
        </ul>
        <p v-if="bulkSkipped > 0" class="text-sm text-muted-foreground">
          {{ t('paymentImports.bulkSkipped', { count: bulkSkipped }) }}
        </p>
        <div class="flex flex-col gap-2">
          <Label>{{ t('paymentImports.method') }}</Label>
          <Select :model-value="bulkMethod" @update:model-value="(v) => (bulkMethod = v as PaymentMethod)">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CASH">{{ t('payment.method.CASH') }}</SelectItem>
              <SelectItem value="BANK_TRANSFER">{{ t('payment.method.BANK_TRANSFER') }}</SelectItem>
              <SelectItem value="MAT_CAPITAL">{{ t('payment.method.MAT_CAPITAL') }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p v-if="bulkError" class="text-sm text-red-500">{{ bulkError }}</p>
        <DialogFooter>
          <Button variant="outline" @click="bulkApproveOpen = false">{{ t('paymentImports.cancel') }}</Button>
          <Button :loading="isBulkApproving" :disabled="bulkApprovable.length === 0" @click="submitBulkApprove">
            {{ t('paymentImports.approve') }}
          </Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>

    <!-- Разбор одной записи -->
    <Dialog :open="reviewOpen" @update:open="(open) => (reviewOpen = open)">
      <DialogScrollContent :class="['flex flex-col gap-4', DIALOG_ANIMATE_CLASS]">
        <DialogHeader>
          <DialogTitle>{{ t('paymentImports.approveDialogTitle') }}</DialogTitle>
        </DialogHeader>

        <template v-if="reviewLoading">
          <p class="text-sm text-muted-foreground">…</p>
        </template>
        <template v-else-if="reviewDetail">
          <div class="grid grid-cols-2 gap-3 text-sm">
            <div>
              <Label class="text-xs text-muted-foreground">{{ t('paymentImports.date') }}</Label>
              <p>{{ formatDate(reviewDetail.candidate.paidAt) }}</p>
            </div>
            <div>
              <Label class="text-xs text-muted-foreground">{{ t('paymentImports.amount') }}</Label>
              <p>{{ formatMoney(reviewDetail.candidate.amount) }}</p>
            </div>
            <div class="col-span-2">
              <Label class="text-xs text-muted-foreground">{{ t('paymentImports.colPayer') }}</Label>
              <p>{{ reviewDetail.candidate.contractorFio ?? '—' }}</p>
            </div>
            <div class="col-span-2">
              <Label class="text-xs text-muted-foreground">{{ t('paymentImports.colComment') }}</Label>
              <p class="break-words">{{ reviewDetail.candidate.comment ?? '—' }}</p>
            </div>
          </div>

          <template v-if="isActionable">
            <div class="flex flex-col gap-2">
              <Label>{{ t('paymentImports.contract') }}</Label>
              <!-- Выбранный договор показывается фиксированной "чипой", не редактируемым
                   текстом — по прямой просьбе 2026-09-03: раньше поле выглядело как
                   обычная строка, хотя реально принимается только клик по пункту списка. -->
              <div v-if="selectedContract && !isPickingContract" class="flex items-center justify-between gap-2 rounded-md border border-input px-3 py-2 text-sm">
                <span>№{{ selectedContract.number }} — {{ selectedContract.residentFullName }}</span>
                <Button variant="ghost" size="sm" @click="changeContract">{{ t('paymentImports.changeContract') }}</Button>
              </div>
              <SearchSelect
                v-else
                v-model="contractQuery"
                :items="contractOptions"
                :item-key="(c: ContractListItem) => c.id"
                :item-label="(c: ContractListItem) => `№${c.number} — ${c.residentFullName}`"
                :placeholder="t('paymentImports.selectContract')"
                :loading="contractSearchLoading"
                @search="searchContracts"
                @select="pickContract"
              />
            </div>

            <div class="flex flex-col gap-2">
              <Label>{{ t('paymentImports.method') }}</Label>
              <Select :model-value="paymentMethod" @update:model-value="(v) => (paymentMethod = v as PaymentMethod)">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">{{ t('payment.method.CASH') }}</SelectItem>
                  <SelectItem value="BANK_TRANSFER">{{ t('payment.method.BANK_TRANSFER') }}</SelectItem>
                  <SelectItem value="MAT_CAPITAL">{{ t('payment.method.MAT_CAPITAL') }}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <!-- Переопределения — по умолчанию скрыты за плейсхолдером значения из 1С,
                 заполняются только если сотрудник считает исходные данные неверными
                 (человеческий фактор — см. промпт проекта). -->
            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-2">
                <Label class="text-xs text-muted-foreground">{{ t('paymentImports.amount') }}</Label>
                <Input v-model.number="overrideAmount" type="number" :placeholder="String(reviewDetail.candidate.amount ?? '')" />
              </div>
              <div class="flex flex-col gap-2">
                <Label class="text-xs text-muted-foreground">{{ t('paymentImports.date') }}</Label>
                <DatePickerField v-model="overridePaidAt" />
              </div>
            </div>

            <template v-if="showRejectConfirm">
              <div class="flex flex-col gap-2 rounded-md border border-border p-3">
                <p class="text-sm">{{ t('paymentImports.rejectDialogDescription') }}</p>
                <Label class="text-xs text-muted-foreground">{{ t('paymentImports.rejectReason') }}</Label>
                <Textarea v-model="rejectReason" rows="2" />
                <div class="flex justify-end gap-2">
                  <Button variant="outline" size="sm" @click="showRejectConfirm = false">{{ t('paymentImports.cancel') }}</Button>
                  <Button variant="outline" size="sm" class="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700" :loading="isRejecting" @click="submitReject">
                    {{ t('paymentImports.reject') }}
                  </Button>
                </div>
              </div>
            </template>
          </template>
          <template v-else>
            <p class="text-sm text-muted-foreground">
              {{ t('paymentImports.alreadyReviewedHint') }} — {{ t(`paymentImports.status.${reviewDetail.status}`) }}
              <span v-if="reviewDetail.matchedContract">(№{{ reviewDetail.matchedContract.number }})</span>
            </p>
          </template>

          <p v-if="reviewError" class="text-sm text-red-500">{{ reviewError }}</p>
        </template>

        <DialogFooter v-if="reviewDetail && isActionable && !showRejectConfirm">
          <Button variant="outline" class="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700" @click="showRejectConfirm = true">
            <X class="size-4" />
            {{ t('paymentImports.reject') }}
          </Button>
          <Button :loading="isApproving" @click="submitApprove">
            <Check class="size-4" />
            {{ t('paymentImports.approve') }}
          </Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>
  </div>
</template>
