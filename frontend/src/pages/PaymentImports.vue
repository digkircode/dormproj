<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ArrowLeft, Ban, Check, ClipboardList, Globe, Landmark, RotateCw } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import EntityTable from '@/components/EntityTable.vue'
import PaymentImportStatusPillCell from '@/components/PaymentImportStatusPillCell.vue'
import WebsitePaymentStatusPillCell from '@/components/WebsitePaymentStatusPillCell.vue'
import PaymentReceiptCell from '@/components/PaymentReceiptCell.vue'
import ContractLinkCell from '@/components/ContractLinkCell.vue'
import ResidentLinkCell from '@/components/ResidentLinkCell.vue'
import { createAppColumnHelper } from '@/lib/table'
import { createClientFetchPage, createClientFacetValues } from '@/lib/client-list'
import { goBack } from '@/lib/utils'
import { dateLocaleTag } from '@/lib/format-locale'
import type { ListOptions } from '@/lib/list-api'
import {
  fetchPaymentImportsPage,
  fetchPaymentImportsFacets,
  fetchPaymentImportDetail,
  fetchWebsitePayments,
  approvePaymentImport,
  type PaymentImportRow,
  type PaymentImportDetail,
  type WebsitePaymentRow,
} from '@/lib/payment-imports-api'
import { reversePayment, syncPaymentToAccounting1c } from '@/lib/billing-api'

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
  REVERSED: t('paymentImports.status.REVERSED'),
}
const ACTIONABLE_IMPORT_STATUSES = new Set<PaymentImportRow['status']>(['NEEDS_REVIEW']);

const importColumnLabels = computed<Record<string, string>>(() => ({
  paidAt: t('paymentImports.colDate'),
  amount: t('paymentImports.colAmount'),
  contractorFio: t('paymentImports.colPayer'),
  comment: t('paymentImports.colComment'),
  contractNumberDisplay: t('paymentImports.colSuggestedContract'),
  status: t('paymentImports.colStatus'),
  type: t('paymentImports.type'),
}))
const importFilterableFields = ['status', 'type']
function importCellText(columnId: string, value: unknown): string {
  if (columnId === 'paidAt' && typeof value === 'string') return formatDate(value)
  if (columnId === 'amount' && typeof value === 'number') return formatMoney(value)
  if (columnId === 'status') return IMPORT_STATUS_LABELS[value as PaymentImportRow['status']] ?? String(value)
  if (columnId === 'contractNumberDisplay') return (value as string | null) ?? t('paymentImports.noSuggestion')
  return String(value ?? '—')
}

// Договор/ФИО — теперь отдельные кликабельные колонки (ContractLinkCell/ResidentLinkCell,
// та же иконка+ссылка, что и в других таблицах проекта, см. отчёты), по прямой просьбе
// 2026-09-04, вместо одной совмещённой "№X — ФИО" текстом. Пока запись не одобрена и
// известен только suggestedContract (не matchedContract) — ссылка ведёт на ПРЕДЛОЖЕННЫЙ
// договор, это не решение, сотрудник всё равно подтверждает явно в диалоге разбора.
interface ImportTableRow extends PaymentImportRow {
  contractId: number | null
  contractNumberDisplay: string | null
  residentIndividualUid: string | null
}
function toImportTableRow(row: PaymentImportRow): ImportTableRow {
  const contract = row.matchedContract ?? row.suggestedContract
  return {
    ...row,
    contractId: contract?.id ?? null,
    contractNumberDisplay: contract ? `№${contract.number}` : null,
    residentIndividualUid: contract?.residentIndividualUid ?? null,
  }
}
async function importFetchPage(options: ListOptions, signal?: AbortSignal) {
  const page = await fetchPaymentImportsPage(options, signal)
  return { ...page, data: page.data.map(toImportTableRow) }
}

const importColumnHelper = createAppColumnHelper<ImportTableRow>()
const importColumns = computed(() =>
  importColumnHelper.columns([
    importColumnHelper.accessor('paidAt', { header: importColumnLabels.value.paidAt, size: 120, minSize: 100 }),
    importColumnHelper.accessor('amount', { header: importColumnLabels.value.amount, enableSorting: false, size: 110, minSize: 100 }),
    importColumnHelper.accessor('contractorFio', { header: importColumnLabels.value.contractorFio, size: 200, minSize: 160 }),
    importColumnHelper.accessor('contractNumberDisplay', { header: importColumnLabels.value.contractNumberDisplay, enableSorting: false, size: 160, minSize: 130 }),
    importColumnHelper.accessor('comment', { header: importColumnLabels.value.comment, enableSorting: false, size: 260, minSize: 180 }),
    importColumnHelper.accessor('type', { header: importColumnLabels.value.type, enableSorting: false, size: 220, minSize: 160 }),
    importColumnHelper.accessor('status', { header: importColumnLabels.value.status, size: 170, minSize: 140 }),
  ]),
)

const importTableRef = ref<{ refresh: () => void | Promise<void> } | null>(null)
const reversingImport = ref<ImportTableRow | null>(null)
const bulkReverseOpen = ref(false)
const isReversingImport = ref(false)
const reverseImportError = ref('')
async function reverseImportedPayment(row: ImportTableRow) {
  if (!row.resultingPaymentId || row.status === 'REVERSED') return
  reverseImportError.value = ''
  reversingImport.value = row
}
const bulkReverseTargets = computed(() => selectedImportRows.value.filter((r) => r.status === 'MATCHED' && r.resultingPaymentId))
async function submitBulkReverse() {
  isReversingImport.value = true
  reverseImportError.value = ''
  try {
    for (const row of bulkReverseTargets.value) await reversePayment(row.resultingPaymentId!)
    bulkReverseOpen.value = false
    selectedImportRows.value = []
    await importTableRef.value?.refresh()
  } catch (error) {
    reverseImportError.value = error instanceof Error ? error.message : String(error)
  } finally { isReversingImport.value = false }
}
async function submitReverseImport() {
  if (!reversingImport.value?.resultingPaymentId) return
  isReversingImport.value = true
  reverseImportError.value = ''
  try {
    await reversePayment(reversingImport.value.resultingPaymentId)
    reversingImport.value = null
    await importTableRef.value?.refresh()
  } catch (error) { reverseImportError.value = error instanceof Error ? error.message : String(error) }
  finally { isReversingImport.value = false }
}

// --- Массовое одобрение (чекбоксы) ---
const selectedImportRows = ref<ImportTableRow[]>([])
const bulkApproveOpen = ref(false)
const bulkError = ref('')
const isBulkApproving = ref(false)

function openBulkApprove() {
  bulkError.value = ''
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
      await approvePaymentImport(row.id)
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
const isApproving = ref(false)

async function openReview(row: PaymentImportRow) {
  reviewOpen.value = true
  reviewLoading.value = true
  reviewError.value = ''
  reviewDetail.value = null
  try {
    reviewDetail.value = await fetchPaymentImportDetail(row.id)
  } catch (error) {
    reviewError.value = error instanceof Error ? error.message : String(error)
  } finally {
    reviewLoading.value = false
  }
}

const isActionable = computed(() => reviewDetail.value?.status === 'NEEDS_REVIEW')

async function submitApprove() {
  if (!reviewDetail.value) return
  isApproving.value = true
  reviewError.value = ''
  try {
    await approvePaymentImport(reviewDetail.value.id)
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
  fiscalReceiptUrl: t('paymentImports.colReceipt'),
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
  // Тот же принцип, что и в объединённом леджере резидента (MyContract.vue) — заглушка
  // чека (касса ещё не подключена, см. промпт проекта «Онлайн-оплата»), не показываем
  // только у сторнированных платежей.
  showReceiptButton: boolean
  fiscalReceiptUrl: string | null
  // Договор/ФИО — кликабельные (ContractLinkCell/ResidentLinkCell, та же иконка+ссылка,
  // что и в других таблицах проекта), по прямой просьбе 2026-09-04. Тут всегда есть
  // реальный договор и резидент (флоу 1 — это уже проведённые платежи с сайта), в отличие
  // от таба "1С Бухгалтерия", где до одобрения может не быть ни того, ни другого.
  contractId: number
  residentIndividualUid: string
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
    showReceiptButton: !p.reversedAt,
    fiscalReceiptUrl: null,
    contractId: p.contract.id,
    residentIndividualUid: p.contract.residentIndividualUid,
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
    websiteColumnHelper.accessor('fiscalReceiptUrl', {
      header: websiteColumnLabels.value.fiscalReceiptUrl,
      enableSorting: false,
      enableHiding: false,
      size: 120,
      minSize: 100,
    }),
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
async function retryWebsitePayment(row: WebsiteTableRow) {
  await syncPaymentToAccounting1c(row.id)
  await loadWebsitePayments()
  await websiteTableRef.value?.refresh()
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
      <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/')">
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
          :fetch-page="importFetchPage"
          :fetch-facet-values="fetchPaymentImportsFacets"
          :get-row-id="(r: ImportTableRow) => String(r.id)"
          :total-label="t('paymentImports.tabImport')"
          :cell-text="importCellText"
          :cell-renderers="{ status: PaymentImportStatusPillCell, contractorFio: ResidentLinkCell, contractNumberDisplay: ContractLinkCell }"
          :row-action="{
            icon: ClipboardList,
            isVisible: (row: ImportTableRow) => row.status !== 'REVERSED',
            getClass: (row: ImportTableRow) => row.status === 'MATCHED' ? 'text-red-500 hover:text-red-500' : 'text-primary',
            label: t('paymentImports.approve'),
            getIcon: (row: ImportTableRow) => row.status === 'MATCHED' ? Ban : ClipboardList,
            getLabel: (row: ImportTableRow) => row.status === 'REVERSED' ? t('paymentImports.status.REVERSED') : row.status === 'MATCHED' ? t('contracts.detail.reverse') : t('paymentImports.approve'),
            onClick: (row: ImportTableRow) => row.status === 'MATCHED' ? reverseImportedPayment(row) : row.status === 'NEEDS_REVIEW' ? openReview(row) : undefined,
          }"
          selectable
          accent-icons
        >
          <template #actions>
            <Button v-if="bulkApprovable.length > 0" size="sm" @click="openBulkApprove">
              {{ t('paymentImports.bulkApprove', { count: bulkApprovable.length }) }}
            </Button>
            <Button v-if="bulkReverseTargets.length > 0" size="sm" variant="outline" class="border-red-500 text-red-500 hover:text-red-500" @click="reverseImportError = ''; bulkReverseOpen = true">
              {{ t('paymentImports.bulkReverse', { count: bulkReverseTargets.length }) }}
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
          :cell-renderers="{
            status: WebsitePaymentStatusPillCell,
            fiscalReceiptUrl: PaymentReceiptCell,
            contractorFio: ResidentLinkCell,
            contractNumber: ContractLinkCell,
          }"
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
        <p v-if="bulkError" class="text-sm text-red-500">{{ bulkError }}</p>
        <DialogFooter>
          <Button variant="outline" @click="bulkApproveOpen = false">{{ t('paymentImports.cancel') }}</Button>
          <Button :loading="isBulkApproving" :disabled="bulkApprovable.length === 0" @click="submitBulkApprove">
            {{ t('paymentImports.approve') }}
          </Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>

    <Dialog :open="bulkReverseOpen" @update:open="(open) => (bulkReverseOpen = open)">
      <DialogScrollContent :class="['flex flex-col gap-4', DIALOG_ANIMATE_CLASS]">
        <DialogHeader><DialogTitle>{{ t('paymentImports.bulkReverseDialogTitle') }}</DialogTitle></DialogHeader>
        <ul class="flex max-h-48 flex-col gap-1 overflow-y-auto text-sm">
          <li v-for="row in bulkReverseTargets" :key="row.id">{{ formatMoney(row.amount) }} — {{ row.contractorFio }}</li>
        </ul>
        <p v-if="reverseImportError" class="text-sm text-red-500">{{ reverseImportError }}</p>
        <DialogFooter>
          <Button variant="outline" @click="bulkReverseOpen = false">{{ t('paymentImports.cancel') }}</Button>
          <Button variant="outline" class="border-red-500 text-red-500 hover:text-red-500" :loading="isReversingImport" @click="submitBulkReverse">{{ t('contracts.detail.confirmReverse') }}</Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>

    <Dialog :open="reversingImport !== null" @update:open="(open) => { if (!open) reversingImport = null }">
      <DialogScrollContent :class="['flex flex-col gap-4', DIALOG_ANIMATE_CLASS]">
        <DialogHeader>
          <DialogTitle>{{ t('contracts.detail.reverseDialogTitle') }}</DialogTitle>
          <DialogDescription>{{ t('contracts.detail.reverseDialogDescription', { amount: reversingImport ? formatMoney(reversingImport.amount) : '', date: reversingImport ? formatDate(reversingImport.paidAt) : '' }) }}</DialogDescription>
        </DialogHeader>
        <p v-if="reverseImportError" class="text-sm text-red-500">{{ reverseImportError }}</p>
        <DialogFooter>
          <Button variant="outline" @click="reversingImport = null">{{ t('paymentImports.cancel') }}</Button>
          <Button variant="outline" class="border-red-500 text-red-500 hover:text-red-500" :loading="isReversingImport" @click="submitReverseImport">{{ t('contracts.detail.confirmReverse') }}</Button>
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
              <Label class="text-xs text-muted-foreground">{{ t('paymentImports.type') }}</Label>
              <p>{{ reviewDetail.candidate.type ?? '—' }}</p>
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

          <div class="flex flex-col gap-2">
            <Label>{{ t('paymentImports.contract') }}</Label>
            <p>{{ reviewDetail.suggestedContract ? '№' + reviewDetail.suggestedContract.number : '—' }}</p>
          </div>
          <template v-if="!isActionable">
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
