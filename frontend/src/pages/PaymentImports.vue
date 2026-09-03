<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ArrowLeft, Check, ClipboardList, Globe, Landmark, RotateCw } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import EntityTable from '@/components/EntityTable.vue'
import SearchSelect from '@/components/SearchSelect.vue'
import PaymentImportStatusPillCell from '@/components/PaymentImportStatusPillCell.vue'
import WebsitePaymentStatusPillCell from '@/components/WebsitePaymentStatusPillCell.vue'
import { createAppColumnHelper } from '@/lib/table'
import { createClientFetchPage, createClientFacetValues } from '@/lib/client-list'
import { goBack, cn } from '@/lib/utils'
import { dateLocaleTag } from '@/lib/format-locale'
import {
  fetchPaymentImportsPage,
  fetchPaymentImportsFacets,
  fetchPaymentImportDetail,
  fetchWebsitePayments,
  approvePaymentImport,
  type PaymentImportRow,
  type PaymentImportDetail,
  type PaymentImportCandidateContract,
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

// ===== Таб "Из бухгалтерии" — очередь одобрения (флоу 2), см. промпт проекта =====

const IMPORT_STATUS_LABELS: Record<PaymentImportRow['status'], string> = {
  NEEDS_REVIEW: t('paymentImports.status.NEEDS_REVIEW'),
  MATCHED: t('paymentImports.status.MATCHED'),
}
const ACTIONABLE_IMPORT_STATUSES = new Set<PaymentImportRow['status']>(['NEEDS_REVIEW']);

const importColumnLabels = computed<Record<string, string>>(() => ({
  paidAt: t('paymentImports.colDate'),
  amount: t('paymentImports.colAmount'),
  contractorFio: t('paymentImports.colPayer'),
  comment: t('paymentImports.colComment'),
  suggestedContract: t('paymentImports.colSuggestedContract'),
  status: t('paymentImports.colStatus'),
}))
const importFilterableFields = ['status']
function importCellText(columnId: string, value: unknown): string {
  if (columnId === 'paidAt' && typeof value === 'string') return formatDate(value)
  if (columnId === 'amount' && typeof value === 'number') return formatMoney(value)
  if (columnId === 'status') return IMPORT_STATUS_LABELS[value as PaymentImportRow['status']] ?? String(value)
  if (columnId === 'suggestedContract') {
    const contract = value as PaymentImportRow['suggestedContract']
    return contract ? `№${contract.number} — ${contract.residentFullName}` : t('paymentImports.noSuggestion')
  }
  return String(value ?? '—')
}

const importColumnHelper = createAppColumnHelper<PaymentImportRow>()
const importColumns = computed(() =>
  importColumnHelper.columns([
    importColumnHelper.accessor('paidAt', { header: importColumnLabels.value.paidAt, size: 120, minSize: 100 }),
    importColumnHelper.accessor('amount', { header: importColumnLabels.value.amount, enableSorting: false, size: 110, minSize: 100 }),
    importColumnHelper.accessor('contractorFio', { header: importColumnLabels.value.contractorFio, size: 200, minSize: 160 }),
    importColumnHelper.accessor('suggestedContract', { header: importColumnLabels.value.suggestedContract, enableSorting: false, size: 220, minSize: 160 }),
    importColumnHelper.accessor('comment', { header: importColumnLabels.value.comment, enableSorting: false, size: 260, minSize: 180 }),
    importColumnHelper.accessor('status', { header: importColumnLabels.value.status, size: 170, minSize: 140 }),
  ]),
)

const importTableRef = ref<{ refresh: () => void | Promise<void> } | null>(null)

// --- Массовое одобрение (чекбоксы) ---
const selectedImportRows = ref<PaymentImportRow[]>([])
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
  selectedImportRows.value.filter((r) => ACTIONABLE_IMPORT_STATUSES.has(r.status) && r.suggestedContract),
)
const bulkSkipped = computed(() => selectedImportRows.value.length - bulkApprovable.value.length)

async function submitBulkApprove() {
  isBulkApproving.value = true
  bulkError.value = ''
  try {
    for (const row of bulkApprovable.value) {
      await approvePaymentImport(row.id, { contractId: row.suggestedContract!.id, method: bulkMethod.value })
    }
    bulkApproveOpen.value = false
    selectedImportRows.value = []
    await importTableRef.value?.refresh()
  } catch (error) {
    bulkError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isBulkApproving.value = false
  }
}

// --- Разбор одной записи (approve) ---
// "Отклонить" убрано целиком (по прямой просьбе 2026-09-03) — при неверных данных
// сотрудник правит их в 1С, у нас перезапишется при следующем импорте, отдельного
// "отказа" в жизненном цикле записи больше нет.
const reviewOpen = ref(false)
const reviewDetail = ref<PaymentImportDetail | null>(null)
const reviewLoading = ref(false)
const reviewError = ref('')
// Подсветка конкретного невалидного поля — ошибка показывается у кнопок (внизу
// диалога), а не вперемешку с содержимым, поле дополнительно обводится красным.
const contractInvalid = ref(false)

// Больше одного договора у контрагента — выбор через Select (простой список среди
// ЕГО договоров), иначе — одна "чипа" с уже предложенным (или строка поиска по всей
// базе, если ни ФИО, ни UID не опознаны вообще).
const isPickingContract = ref(false)
const selectedContract = ref<ContractListItem | null>(null)
const contractQuery = ref('')
const contractOptions = ref<ContractListItem[]>([])
const contractSearchLoading = ref(false)
const paymentMethod = ref<PaymentMethod>('CASH')
const isApproving = ref(false)

function candidateToListItem(c: PaymentImportCandidateContract, residentFullName: string | null): ContractListItem {
  return { id: c.id, number: c.number, contractDate: c.contractDate, residentFullName: residentFullName ?? '' } as ContractListItem
}

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
  contractInvalid.value = false
}
function changeContract() {
  isPickingContract.value = true
  contractQuery.value = ''
  contractOptions.value = []
}
function selectCandidateContract(contractId: string) {
  const candidate = reviewDetail.value?.candidateContracts.find((c) => String(c.id) === contractId)
  if (!candidate) return
  selectedContract.value = candidateToListItem(candidate, reviewDetail.value?.candidate.contractorFio ?? null)
  contractInvalid.value = false
}

async function openReview(row: PaymentImportRow) {
  reviewOpen.value = true
  reviewLoading.value = true
  reviewError.value = ''
  contractInvalid.value = false
  reviewDetail.value = null
  selectedContract.value = null
  isPickingContract.value = false
  contractQuery.value = ''
  contractOptions.value = []
  paymentMethod.value = 'CASH'
  try {
    const detail = await fetchPaymentImportDetail(row.id)
    reviewDetail.value = detail
    if (detail.candidateContracts.length > 1) {
      // Несколько договоров у контрагента — по умолчанию ничего не выбираем сами,
      // сотрудник обязан явно выбрать нужный из своего же списка.
      if (detail.suggestedContract) {
        const match = detail.candidateContracts.find((c) => c.id === detail.suggestedContract!.id)
        if (match) selectedContract.value = candidateToListItem(match, detail.candidate.contractorFio)
      }
    } else if (detail.suggestedContract) {
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

const isActionable = computed(() => reviewDetail.value?.status === 'NEEDS_REVIEW')

async function submitApprove() {
  if (!reviewDetail.value) return
  if (!selectedContract.value) {
    contractInvalid.value = true
    reviewError.value = t('paymentImports.errors.contractRequired')
    return
  }
  contractInvalid.value = false
  isApproving.value = true
  reviewError.value = ''
  try {
    await approvePaymentImport(reviewDetail.value.id, {
      contractId: selectedContract.value.id,
      method: paymentMethod.value,
    })
    reviewOpen.value = false
    await importTableRef.value?.refresh()
  } catch (error) {
    reviewError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isApproving.value = false
  }
}

// ===== Таб "С сайта" — WEBSITE-платежи (эквайринг) со статусом отправки в 1С (флоу 1) =====

const WEBSITE_STATUS_LABELS: Record<WebsitePaymentRow['accounting1cSyncStatus'], string> = {
  NOT_SYNCED: t('paymentImports.statusWebsite.NOT_SYNCED'),
  SYNCED: t('paymentImports.statusWebsite.SYNCED'),
  FAILED: t('paymentImports.statusWebsite.FAILED'),
}

const websitePayments = ref<WebsitePaymentRow[]>([])
const websiteLoadError = ref('')
async function loadWebsitePayments() {
  websiteLoadError.value = ''
  try {
    websitePayments.value = await fetchWebsitePayments()
  } catch (error) {
    websiteLoadError.value = error instanceof Error ? error.message : String(error)
  }
}
loadWebsitePayments()

const websiteColumnLabels = computed<Record<string, string>>(() => ({
  paidAt: t('paymentImports.colDate'),
  amount: t('paymentImports.colAmount'),
  contractorFio: t('paymentImports.colPayer'),
  purpose: t('paymentImports.colComment'),
  contractNumber: t('paymentImports.colSuggestedContract'),
  status: t('paymentImports.colStatus'),
}))
function websiteCellText(columnId: string, value: unknown): string {
  if (columnId === 'paidAt' && typeof value === 'string') return formatDate(value)
  if (columnId === 'amount' && typeof value === 'number') return formatMoney(value)
  if (columnId === 'status') return WEBSITE_STATUS_LABELS[value as WebsitePaymentRow['accounting1cSyncStatus']] ?? String(value)
  return String(value ?? '—')
}

interface WebsiteTableRow {
  id: number
  paidAt: string
  amount: number
  contractorFio: string
  purpose: string
  contractNumber: string
  status: WebsitePaymentRow['accounting1cSyncStatus']
  raw: WebsitePaymentRow
}
const websiteTableRows = computed<WebsiteTableRow[]>(() =>
  websitePayments.value.map((p) => ({
    id: p.id,
    paidAt: p.paidAt,
    amount: p.amount,
    contractorFio: p.contractorFio,
    purpose: p.purpose,
    contractNumber: `№${p.contract.number}`,
    status: p.accounting1cSyncStatus,
    raw: p,
  })),
)

const websiteColumnHelper = createAppColumnHelper<WebsiteTableRow>()
const websiteColumns = computed(() =>
  websiteColumnHelper.columns([
    websiteColumnHelper.accessor('paidAt', { header: websiteColumnLabels.value.paidAt, size: 120, minSize: 100 }),
    websiteColumnHelper.accessor('amount', { header: websiteColumnLabels.value.amount, enableSorting: false, size: 110, minSize: 100 }),
    websiteColumnHelper.accessor('contractorFio', { header: websiteColumnLabels.value.contractorFio, size: 200, minSize: 160 }),
    websiteColumnHelper.accessor('contractNumber', { header: websiteColumnLabels.value.contractNumber, enableSorting: false, size: 140, minSize: 110 }),
    websiteColumnHelper.accessor('purpose', { header: websiteColumnLabels.value.purpose, enableSorting: false, size: 280, minSize: 180 }),
    websiteColumnHelper.accessor('status', { header: websiteColumnLabels.value.status, size: 170, minSize: 140 }),
  ]),
)
const websiteFetchPage = createClientFetchPage<WebsiteTableRow>(() => websiteTableRows.value, {
  searchText: (row) => `${row.contractorFio} ${row.purpose} ${row.contractNumber}`,
  sortValue: (row, sortBy) => (row as unknown as Record<string, string | number>)[sortBy] ?? '',
  filterValue: (row, field) => (field === 'status' ? row.status : ''),
})
const websiteFetchFacetValues = createClientFacetValues<WebsiteTableRow>(
  () => websiteTableRows.value,
  (row, field) => (field === 'status' ? row.status : ''),
  (_field, value) => WEBSITE_STATUS_LABELS[value as WebsitePaymentRow['accounting1cSyncStatus']] ?? value,
)

const websiteTableRef = ref<{ refresh: () => void | Promise<void> } | null>(null)
const retryingWebsiteId = ref<number | null>(null)
async function retryWebsitePayment(row: WebsiteTableRow) {
  retryingWebsiteId.value = row.id
  try {
    await syncPaymentToAccounting1c(row.id)
    await loadWebsitePayments()
    await websiteTableRef.value?.refresh()
  } finally {
    retryingWebsiteId.value = null
  }
}

// --- Массовый повтор отправки (чекбоксы) — для тех, кто ещё не отправился/упал, по
// прямой просьбе 2026-09-03. Без диалога — в отличие от одобрения, тут нечего уточнять,
// просто дёргаем тот же ручной ретрай на каждой отмеченной строке. ---
const selectedWebsiteRows = ref<WebsiteTableRow[]>([])
const isBulkRetrying = ref(false)
const bulkRetryTargets = computed(() => selectedWebsiteRows.value.filter((r) => r.status !== 'SYNCED'))

async function submitBulkRetry() {
  isBulkRetrying.value = true
  try {
    for (const row of bulkRetryTargets.value) {
      await syncPaymentToAccounting1c(row.id)
    }
    selectedWebsiteRows.value = []
    await loadWebsitePayments()
    await websiteTableRef.value?.refresh()
  } finally {
    isBulkRetrying.value = false
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

    <Tabs default-value="import" class="flex min-h-0 flex-1 flex-col">
      <TabsList class="w-fit self-start">
        <TabsTrigger value="import">
          <span class="flex items-center gap-1.5">
            <Landmark class="size-4 text-primary" />
            {{ t('paymentImports.tabImport') }}
          </span>
        </TabsTrigger>
        <TabsTrigger value="website">
          <span class="flex items-center gap-1.5">
            <Globe class="size-4 text-primary" />
            {{ t('paymentImports.tabWebsite') }}
          </span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="import" class="flex min-h-0 flex-1 flex-col">
        <EntityTable
          ref="importTableRef"
          v-model:selected="selectedImportRows"
          :columns="importColumns"
          :column-labels="importColumnLabels"
          :filterable-fields="importFilterableFields"
          :default-sort="{ id: 'paidAt', desc: true }"
          :default-filters="{ status: ['NEEDS_REVIEW'] }"
          :fetch-page="fetchPaymentImportsPage"
          :fetch-facet-values="fetchPaymentImportsFacets"
          :get-row-id="(r: PaymentImportRow) => String(r.id)"
          :total-label="t('paymentImports.tabImport')"
          :cell-text="importCellText"
          :cell-renderers="{ status: PaymentImportStatusPillCell }"
          :row-action="{ icon: ClipboardList, label: t('paymentImports.approve'), onClick: openReview }"
          selectable
          accent-icons
        >
          <template #actions>
            <Button v-if="selectedImportRows.length > 0" size="sm" @click="openBulkApprove">
              {{ t('paymentImports.bulkApprove', { count: selectedImportRows.length }) }}
            </Button>
          </template>
        </EntityTable>
      </TabsContent>

      <TabsContent value="website" class="flex min-h-0 flex-1 flex-col">
        <p v-if="websiteLoadError" class="text-sm text-red-500">{{ websiteLoadError }}</p>
        <EntityTable
          ref="websiteTableRef"
          v-model:selected="selectedWebsiteRows"
          :columns="websiteColumns"
          :column-labels="websiteColumnLabels"
          :filterable-fields="['status']"
          :default-sort="{ id: 'paidAt', desc: true }"
          :fetch-page="websiteFetchPage"
          :fetch-facet-values="websiteFetchFacetValues"
          :get-row-id="(r: WebsiteTableRow) => String(r.id)"
          :total-label="t('paymentImports.tabWebsite')"
          :cell-text="websiteCellText"
          :cell-renderers="{ status: WebsitePaymentStatusPillCell }"
          :row-action="{ icon: RotateCw, label: t('contracts.detail.accounting1cRetry'), onClick: retryWebsitePayment }"
          selectable
          accent-icons
        >
          <template #actions>
            <Button v-if="bulkRetryTargets.length > 0" size="sm" :loading="isBulkRetrying" @click="submitBulkRetry">
              {{ t('paymentImports.bulkRetry', { count: bulkRetryTargets.length }) }}
            </Button>
          </template>
        </EntityTable>
      </TabsContent>
    </Tabs>

    <!-- Массовое одобрение -->
    <Dialog :open="bulkApproveOpen" @update:open="(open) => (bulkApproveOpen = open)">
      <DialogScrollContent :class="['flex flex-col gap-4', DIALOG_ANIMATE_CLASS]">
        <DialogHeader>
          <DialogTitle>{{ t('paymentImports.bulkApproveDialogTitle') }}</DialogTitle>
        </DialogHeader>
        <ul class="flex max-h-48 flex-col gap-1 overflow-y-auto text-sm">
          <li v-for="row in bulkApprovable" :key="row.id">
            {{ formatMoney(row.amount) }} — {{ row.contractorFio }} → №{{ row.suggestedContract!.number }}
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

              <!-- Несколько договоров у контрагента — простой Select среди ЕГО списка,
                   без свободного поиска по всей базе (по прямой просьбе 2026-09-03). -->
              <Select
                v-if="reviewDetail.candidateContracts.length > 1"
                :model-value="selectedContract ? String(selectedContract.id) : undefined"
                @update:model-value="(v) => selectCandidateContract(v as string)"
              >
                <SelectTrigger :class="cn(contractInvalid && 'border-red-500 focus-visible:ring-red-500/20')">
                  <SelectValue :placeholder="t('paymentImports.selectContract')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="c in reviewDetail.candidateContracts" :key="c.id" :value="String(c.id)">
                    №{{ c.number }} — {{ formatDate(c.contractDate) }}
                  </SelectItem>
                </SelectContent>
              </Select>

              <!-- Один известный договор — фиксированная "чипа", не редактируемым
                   текстом (реально принимается только клик по пункту списка ниже). -->
              <div
                v-else-if="selectedContract && !isPickingContract"
                :class="cn('flex items-center justify-between gap-2 rounded-md border border-input px-3 py-2 text-sm', contractInvalid && 'border-red-500')"
              >
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
                :invalid="contractInvalid"
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
          </template>
          <template v-else>
            <p class="text-sm text-muted-foreground">
              {{ t('paymentImports.alreadyReviewedHint') }} — {{ t(`paymentImports.status.${reviewDetail.status}`) }}
              <span v-if="reviewDetail.matchedContract">(№{{ reviewDetail.matchedContract.number }})</span>
            </p>
          </template>
        </template>

        <!-- Ошибка — на уровне кнопок, не вперемешку с содержимым выше; конкретное
             невалидное поле (например договор) дополнительно подсвечивается сам собой. -->
        <DialogFooter v-if="reviewDetail && isActionable" class="flex-col items-stretch gap-2 sm:flex-col">
          <p v-if="reviewError" class="text-sm text-red-500">{{ reviewError }}</p>
          <div class="flex justify-end gap-2">
            <Button variant="outline" @click="reviewOpen = false">{{ t('paymentImports.cancel') }}</Button>
            <Button :loading="isApproving" @click="submitApprove">
              <Check class="size-4" />
              {{ t('paymentImports.approve') }}
            </Button>
          </div>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>
  </div>
</template>
