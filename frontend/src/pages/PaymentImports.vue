<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ArrowLeft, Check, ClipboardList, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import EntityTable from '@/components/EntityTable.vue'
import SearchSelect from '@/components/SearchSelect.vue'
import { createAppColumnHelper } from '@/lib/table'
import { goBack } from '@/lib/utils'
import { dateLocaleTag } from '@/lib/format-locale'
import {
  fetchPaymentImportsPage,
  fetchPaymentImportsFacets,
  fetchPaymentImportDetail,
  approvePaymentImport,
  rejectPaymentImport,
  type PaymentImportRow,
  type PaymentImportDetail,
} from '@/lib/payment-imports-api'
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

// --- Список ---
const columnLabels = computed<Record<string, string>>(() => ({
  paidAt: t('paymentImports.colDate'),
  amount: t('paymentImports.colAmount'),
  contractorFio: t('paymentImports.colPayer'),
  comment: t('paymentImports.colComment'),
  suggestedContract: t('paymentImports.colSuggestedContract'),
  status: t('paymentImports.colStatus'),
}))
const filterableFields = ['status']
function cellText(columnId: string, value: unknown): string {
  if (columnId === 'paidAt' && typeof value === 'string') return formatDate(value)
  if (columnId === 'amount' && typeof value === 'number') return formatMoney(value)
  if (columnId === 'status' && typeof value === 'string') return t(`paymentImports.status.${value}`)
  if (columnId === 'suggestedContract') {
    const contract = value as PaymentImportRow['suggestedContract']
    return contract ? `№${contract.number} — ${contract.residentFullName}` : t('paymentImports.noSuggestion')
  }
  return String(value ?? '—')
}

const columnHelper = createAppColumnHelper<PaymentImportRow>()
const columns = computed(() =>
  columnHelper.columns([
    columnHelper.accessor('paidAt', { header: columnLabels.value.paidAt, size: 120, minSize: 100 }),
    columnHelper.accessor('amount', { header: columnLabels.value.amount, size: 120, minSize: 100 }),
    columnHelper.accessor('contractorFio', { header: columnLabels.value.contractorFio, size: 220, minSize: 160 }),
    columnHelper.accessor('comment', { header: columnLabels.value.comment, enableSorting: false, size: 260, minSize: 160 }),
    columnHelper.accessor('suggestedContract', { header: columnLabels.value.suggestedContract, enableSorting: false, size: 220, minSize: 160 }),
    columnHelper.accessor('status', { header: columnLabels.value.status, enableSorting: true, size: 130, minSize: 110 }),
  ]),
)

const tableRef = ref<{ refresh: () => void | Promise<void> } | null>(null)

// --- Разбор одной записи ---
const reviewOpen = ref(false)
const reviewDetail = ref<PaymentImportDetail | null>(null)
const reviewLoading = ref(false)
const reviewError = ref('')

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

async function openReview(row: PaymentImportRow) {
  reviewOpen.value = true
  reviewLoading.value = true
  reviewError.value = ''
  reviewDetail.value = null
  selectedContract.value = null
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
      contractQuery.value = `№${detail.suggestedContract.number} — ${detail.suggestedContract.residentFullName}`
      selectedContract.value = {
        id: detail.suggestedContract.id,
        number: detail.suggestedContract.number,
        residentFullName: detail.suggestedContract.residentFullName,
      } as ContractListItem
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
    await tableRef.value?.refresh()
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
    await tableRef.value?.refresh()
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

    <EntityTable
      ref="tableRef"
      :columns="columns"
      :column-labels="columnLabels"
      :filterable-fields="filterableFields"
      :default-sort="{ id: 'paidAt', desc: true }"
      :default-filters="{ status: ['IMPORTED', 'NEEDS_REVIEW'] }"
      :fetch-page="fetchPaymentImportsPage"
      :fetch-facet-values="fetchPaymentImportsFacets"
      :get-row-id="(r: PaymentImportRow) => String(r.id)"
      :total-label="t('paymentImports.title')"
      :cell-text="cellText"
      :row-action="{ icon: ClipboardList, label: t('paymentImports.approve'), onClick: openReview }"
    />

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
              <SearchSelect
                v-model="contractQuery"
                :items="contractOptions"
                :item-key="(c: ContractListItem) => c.id"
                :item-label="(c: ContractListItem) => `№${c.number} — ${c.residentFullName}`"
                :placeholder="t('paymentImports.selectContract')"
                :loading="contractSearchLoading"
                @search="searchContracts"
                @select="(c: ContractListItem) => (selectedContract = c)"
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
                <Input v-model="overridePaidAt" type="date" />
              </div>
            </div>

            <template v-if="showRejectConfirm">
              <div class="flex flex-col gap-2 rounded-md border border-border p-3">
                <p class="text-sm">{{ t('paymentImports.rejectDialogDescription') }}</p>
                <Label class="text-xs text-muted-foreground">{{ t('paymentImports.rejectReason') }}</Label>
                <Textarea v-model="rejectReason" rows="2" />
                <div class="flex justify-end gap-2">
                  <Button variant="outline" size="sm" @click="showRejectConfirm = false">{{ t('paymentImports.cancel') }}</Button>
                  <Button variant="destructive" size="sm" :loading="isRejecting" @click="submitReject">{{ t('paymentImports.reject') }}</Button>
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
          <Button variant="outline" @click="showRejectConfirm = true">
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
