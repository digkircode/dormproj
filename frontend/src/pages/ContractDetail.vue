<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  Ban,
  CalendarClock,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  DoorOpen,
  Download,
  Droplet,
  HandCoins,
  History,
  MoreVertical,
  Percent,
  Printer,
  Receipt,
  RotateCw,
  Search,
  Trash2,
  User,
  Users,
  Wallet,
} from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import TableSkeleton from '@/components/TableSkeleton.vue'
import Skeleton from '@/components/ui/skeleton/Skeleton.vue'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import ContractStatusPill from '@/components/ContractStatusPill.vue'
import Accounting1cLinkedBadge from '@/components/Accounting1cLinkedBadge.vue'
import Accounting1cMappingDialog from '@/components/Accounting1cMappingDialog.vue'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogScrollContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import DatePickerField from '@/components/DatePickerField.vue'
import RoomInfoTrigger from '@/components/RoomInfoTrigger.vue'
import {
  fetchContractDetail,
  terminateContract,
  deleteContract,
  downloadContractDocument,
  fetchContractDocumentPdf,
  type AccrualRow,
  type ContractDetail,
  type PaymentRow,
} from '@/lib/contracts-api'
import { reversePayment, recalculatePenalty, recordContractRefund } from '@/lib/billing-api'
import Accounting1cStatusPill from '@/components/Accounting1cStatusPill.vue'
import { goBack } from '@/lib/utils'
import { breadcrumbOverride } from '@/lib/breadcrumb-state'
import { dateLocaleTag } from '@/lib/format-locale'
import { printPdfBlob } from '@/lib/print-pdf'

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
// Вертикальные разделители колонок — тот же приём, что и в общей таблице (EntityTable.vue),
// для визуального единства всех таблиц в приложении.
const CELL_BORDER_CLASS = 'border-r border-border last:border-r-0'

const { t } = useI18n()

const route = useRoute()
const router = useRouter()
const contractId = computed(() => Number(route.params.id))

const contract = ref<ContractDetail | null>(null)
const isLoading = ref(true)
const loadError = ref('')
const mappingDialogRef = ref<InstanceType<typeof Accounting1cMappingDialog> | null>(null)

function openAccounting1cMapping() {
  if (!contract.value) return
  mappingDialogRef.value?.open({
    kind: 'contract',
    id: contract.value.id,
    label: t('contracts.detail.titleWithNumber', { number: contract.value.number }),
    contractUid: contract.value.accounting1cUid,
    contractorUid: contract.value.accounting1cContractorUid,
  })
}

async function load() {
  isLoading.value = true
  loadError.value = ''
  try {
    contract.value = await fetchContractDetail(contractId.value)
    breadcrumbOverride.value = t('contracts.detail.titleWithNumber', { number: contract.value.number })
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isLoading.value = false
  }
}

onMounted(load)
onUnmounted(() => {
  breadcrumbOverride.value = null
})

// Пеня — единая сумма на договор (не входит в accrual.balance, см. penalty-balance.ts на
// бэке) — добавляем её отдельно, иначе общий баланс не совпадал бы с реальным долгом.
const totalBalance = computed(() =>
  contract.value ? contract.value.accruals.filter((a) => !a.voidedAt).reduce((sum, a) => sum + a.balance, 0) + contract.value.penaltyBalance - contract.value.creditBalance : 0,
)
const isBalanceDialogOpen = ref(false)
const correctionTotal = computed(() => contract.value?.accruals
  .filter((a) => !a.voidedAt && a.adjustmentAmount < 0)
  .reduce((sum, a) => sum - a.adjustmentAmount, 0) ?? 0)
const refundedTotal = computed(() => contract.value?.refunds.reduce((sum, row) => sum + row.amount, 0) ?? 0)
const refundedCorrection = computed(() => contract.value?.refunds.reduce((sum, row) => sum + row.adjustmentAmount, 0) ?? 0)

// История начисления пени по дням — раскрывается кликом по тайлу "Пени" (тот же приём,
// что и у резидента, см. MyContract.vue), плюс кнопка "Пересчитать" для сотрудника
// (2026-09-05, billing.controller.ts#recalculatePenalty) — полная пересборка журнала пени
// договора с нуля тем же дневным расчётом, что и ночной крон (нужно для договоров, чью
// историю пени крон мог посчитать неверно ДО фикса дневного расчёта, см. промпт проекта).
const isPenaltyDialogOpen = ref(false)
const PENALTY_DAILY_RATE_PERCENT = '0,14%'
const isRecalculatingPenalty = ref(false)
const penaltyLogDuringRecalc = ref<ContractDetail['penaltyLog'] | null>(null)
const visiblePenaltyLog = computed(() =>
  isRecalculatingPenalty.value ? (penaltyLogDuringRecalc.value ?? []) : (contract.value?.penaltyLog ?? []),
)
const recalculatePenaltyError = ref('')
async function submitRecalculatePenalty() {
  penaltyLogDuringRecalc.value = contract.value?.penaltyLog ?? []
  isRecalculatingPenalty.value = true
  recalculatePenaltyError.value = ''
  try {
    await recalculatePenalty(contractId.value)
    await load()
  } catch (error) {
    recalculatePenaltyError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isRecalculatingPenalty.value = false
    penaltyLogDuringRecalc.value = null
  }
}
const rentAmount = computed(() => contract.value?.terms[0]?.rentAmount ?? 0)
const utilitiesAmount = computed(() => contract.value?.terms[0]?.utilitiesAmount ?? 0)
const roomCost = computed(() => rentAmount.value + utilitiesAmount.value)
// rentAmount=0 и utilitiesAmount=0 одновременно — только у полностью посуточных комнат
// (112-2/410-2 на момент введения, см. backend/src/contracts/contracts.controller.ts
// #isDailyOnlyRoom), обычная комната всегда имеет ненулевую месячную "Стоимость".
const isDailyOnlyContract = computed(
  () => (contract.value?.terms[0]?.rentAmount ?? 0) === 0 && (contract.value?.terms[0]?.utilitiesAmount ?? 0) === 0,
)

// Блок родителя на карточке договора — плавно раскрывается по клику, не модалка.
const showParentInfo = ref(false)

// --- Сортировка таблиц (локальная, без похода на бэкенд — строк на договор мало) ---
// Ключ сортировки — string, не keyof T: колонок мало и они описаны прямо тут же в
// массиве ниже, полная дженерик-типизация была бы избыточна ради пары маленьких таблиц.
function useLocalSort<T extends object>(rows: () => T[], initialId: string) {
  const sort = ref({ id: initialId, desc: false })
  const sorted = computed(() => {
    const { id, desc } = sort.value
    return [...rows()].sort((a, b) => {
      const av = (a as Record<string, unknown>)[id]
      const bv = (b as Record<string, unknown>)[id]
      if (av === bv) return 0
      const cmp = (av as string | number) > (bv as string | number) ? 1 : -1
      return desc ? -cmp : cmp
    })
  })
  function toggle(id: string) {
    sort.value = sort.value.id === id ? { id, desc: !sort.value.desc } : { id, desc: false }
  }
  return { sort, sorted, toggle }
}

function sortIcon(sort: { id: string; desc: boolean }, id: string) {
  if (sort.id !== id) return ArrowUpDown
  return sort.desc ? ArrowDown : ArrowUp
}

const ACCRUAL_COLUMNS = computed<{ id: keyof AccrualRow; label: string }[]>(() => [
  { id: 'periodStart', label: t('contracts.detail.colPeriod') },
  { id: 'dueDate', label: t('contracts.detail.colDueDate') },
  { id: 'total', label: t('contracts.detail.colCost') },
  { id: 'adjustmentAmount', label: t('contracts.detail.colAdjustment') },
  { id: 'paid', label: t('contracts.detail.colPaid') },
  { id: 'balance', label: t('contracts.detail.colBalance') },
])
// Свободная часть платежей хранится на договоре, а не в строке начисления.
// Для таблицы относим её к последней переплаченной строке (или к последней
// активной строке), чтобы сумма «Остатков» совпадала с балансом без пени.
const displayedAccruals = computed<AccrualRow[]>(() => {
  const currentContract = contract.value
  if (!currentContract?.creditBalance) return currentContract?.accruals ?? []
  const active = currentContract.accruals.filter((a) => !a.voidedAt)
  const latestFirst = [...active].sort((a, b) => b.periodStart.localeCompare(a.periodStart))
  const targetId = (latestFirst.find((a) => a.balance < 0) ?? latestFirst[0])?.id
  return currentContract.accruals.map((a) =>
    a.id === targetId ? { ...a, balance: a.balance - currentContract.creditBalance } : a,
  )
})
const { sort: accrualSort, sorted: sortedAccruals, toggle: toggleAccrualSort } = useLocalSort(
  () => displayedAccruals.value,
  'periodStart' satisfies keyof AccrualRow,
)
const PAYMENT_COLUMNS = computed<{ id: keyof PaymentRow; label: string }[]>(() => [
  { id: 'paidAt', label: t('contracts.detail.colDate') },
  { id: 'amount', label: t('contracts.detail.colAmount') },
  { id: 'method', label: t('contracts.detail.colMethod') },
  { id: 'purpose', label: t('contracts.detail.colPurpose') },
  { id: 'rawComment', label: t('contracts.detail.colComment') },
])
type PaymentMovementRow = Omit<PaymentRow, 'method'> & { method: PaymentRow['method'] | 'CORRECTION'; isRefund?: boolean }
const paymentMovements = computed<PaymentMovementRow[]>(() => [
  ...(contract.value?.payments ?? []),
  ...(contract.value?.refunds ?? []).map((refund) => ({
    id: refund.id,
    amount: refund.amount,
    paidAt: refund.refundedAt,
    method: 'CORRECTION' as const,
    source: 'REFUND',
    externalRef: null,
    rawComment: refund.comment,
    reversedAt: null,
    createdAt: refund.refundedAt,
    purpose: `1С: Бухгалтерия | Возврат | ${new Date(refund.periodStart ?? refund.refundedAt).toLocaleDateString('ru-RU', { month: 'long', timeZone: 'UTC' })} ${new Date(refund.periodStart ?? refund.refundedAt).getUTCFullYear()}`,
    isRefund: true,
  })),
])
const { sort: paymentSort, sorted: sortedPayments, toggle: togglePaymentSort } = useLocalSort(
  () => paymentMovements.value,
  'paidAt' satisfies keyof PaymentRow,
)

const activeTableTab = ref('accruals')
const accrualSearch = ref('')
const paymentSearch = ref('')
const activeSearch = computed({
  get: () => activeTableTab.value === 'accruals' ? accrualSearch.value : paymentSearch.value,
  set: (value: string | number) => {
    if (activeTableTab.value === 'accruals') accrualSearch.value = String(value)
    else paymentSearch.value = String(value)
  },
})
const filteredAccruals = computed(() => {
  const query = accrualSearch.value.trim().toLocaleLowerCase()
  if (!query) return sortedAccruals.value
  return sortedAccruals.value.filter((row) => [
    formatDate(row.periodStart), formatDate(row.periodEnd), formatDate(row.dueDate),
    formatMoney(row.total), formatMoney(row.adjustmentAmount), row.adjustmentReason ?? '',
    formatMoney(row.paid), formatMoney(row.balance),
    row.voidedAt ? t('contracts.detail.voided') : '',
  ].join(' ').toLocaleLowerCase().includes(query))
})
const filteredPayments = computed(() => {
  const query = paymentSearch.value.trim().toLocaleLowerCase()
  if (!query) return sortedPayments.value
  return sortedPayments.value.filter((row) => [
    formatDate(row.paidAt), formatMoney(row.amount),
    row.isRefund ? t('contracts.detail.refundMethod') : t(`payment.method.${row.method}`),
    row.purpose ?? '', row.rawComment ?? '',
    row.source === 'WEBSITE' ? t(`contracts.detail.accounting1c${row.accounting1cSyncStatus === 'SYNCED' ? 'Synced' : row.accounting1cSyncStatus === 'FAILED' ? 'Failed' : 'NotSynced'}`) : '',
  ].join(' ').toLocaleLowerCase().includes(query))
})

const isRefundOpen = ref(false)
const refundPickerOpen = ref(false)
const includeCorrection = ref(false)
const includeOverpayment = ref(false)
const correctionRefundAmount = ref('')
const overpaymentRefundAmount = ref('')
const refundDate = ref('')
const refundComment = ref('')
const refundError = ref('')
const isSavingRefund = ref(false)
function parsedRefundAmount(value: string): number {
  return /^\d+(?:[.,]\d{1,2})?$/.test(value) ? Number(value.replace(',', '.')) : NaN
}
const selectedCorrectionAmount = computed(() => includeCorrection.value ? parsedRefundAmount(correctionRefundAmount.value) : 0)
const selectedOverpaymentAmount = computed(() => includeOverpayment.value ? parsedRefundAmount(overpaymentRefundAmount.value) : 0)
const selectedRefundAmount = computed(() => {
  const amount = selectedCorrectionAmount.value + selectedOverpaymentAmount.value
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0
})
const refundSelectionSummary = computed(() => [
  includeCorrection.value ? t('contracts.detail.refundCorrection') : '',
  includeOverpayment.value ? t('contracts.detail.extraOverpayment') : '',
].filter(Boolean).join(', ') || t('contracts.detail.noRefundSourceSelected'))
function openRefund() {
  const now = new Date()
  refundDate.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const sources = contract.value?.refundSources
  includeCorrection.value = (sources?.correctionAmount ?? 0) > 0
  includeOverpayment.value = (sources?.overpaymentAmount ?? 0) > 0
  correctionRefundAmount.value = String(sources?.correctionAmount ?? '')
  overpaymentRefundAmount.value = String(sources?.overpaymentAmount ?? '')
  refundPickerOpen.value = false
  refundComment.value = ''
  refundError.value = ''
  isRefundOpen.value = true
}
async function saveRefund() {
  const correctionAmount = selectedCorrectionAmount.value
  const overpaymentAmount = selectedOverpaymentAmount.value
  const sources = contract.value?.refundSources
  if (!refundDate.value || !Number.isFinite(correctionAmount) || !Number.isFinite(overpaymentAmount)
    || correctionAmount < 0 || overpaymentAmount < 0 || selectedRefundAmount.value <= 0
    || correctionAmount > (sources?.correctionAmount ?? 0)
    || overpaymentAmount > (sources?.overpaymentAmount ?? 0)) {
    refundError.value = t('contracts.detail.refundSelectionInvalid')
    return
  }
  isSavingRefund.value = true
  refundError.value = ''
  try {
    await recordContractRefund(contractId.value, {
      amount: selectedRefundAmount.value, correctionAmount, overpaymentAmount,
      refundedAt: refundDate.value, comment: refundComment.value.trim() || null,
    })
    isRefundOpen.value = false
    await load()
  } catch (error) {
    refundError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isSavingRefund.value = false
  }
}

function formatDate(value: string | null): string {
  if (!value) return '-'
  return new Date(value).toLocaleDateString(dateLocaleTag())
}
function formatMoney(value: number): string {
  return `${value.toLocaleString(dateLocaleTag(), { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`
}

// --- Расторжение ---
const isTerminateOpen = ref(false)
const actualEndDate = ref('')
const terminateError = ref('')
const isTerminating = ref(false)

function openTerminate() {
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const contractEndDate = contract.value?.endDate.slice(0, 10)
  actualEndDate.value = contractEndDate && contractEndDate < today ? contractEndDate : today
  terminateError.value = ''
  isTerminateOpen.value = true
}
async function submitTerminate() {
  if (!actualEndDate.value) return
  isTerminating.value = true
  terminateError.value = ''
  try {
    await terminateContract(contractId.value, actualEndDate.value)
    isTerminateOpen.value = false
    await load()
  } catch (error) {
    terminateError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isTerminating.value = false
  }
}

// --- Удаление договора ---
// Доступно, только пока по договору не было ни одной оплаты (contract.hasPayments,
// см. contracts.controller.ts) — после первой же оплаты кнопка блокируется навсегда.
const isDeleteOpen = ref(false)
const deleteError = ref('')
const isDeleting = ref(false)

function openDelete() {
  deleteError.value = ''
  isDeleteOpen.value = true
}
async function submitDelete() {
  isDeleting.value = true
  deleteError.value = ''
  try {
    await deleteContract(contractId.value)
    router.push({ name: 'contracts' })
  } catch (error) {
    deleteError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isDeleting.value = false
  }
}

// --- Печать договора ---
const isDownloading = ref(false)
const downloadError = ref('')
async function downloadDocument() {
  if (!contract.value) return
  isDownloading.value = true
  downloadError.value = ''
  try {
    await downloadContractDocument(contract.value.id, contract.value.number)
  } catch (error) {
    downloadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isDownloading.value = false
  }
}

// Печать через системный диалог (Ctrl+P) — доп. к скачиванию .docx выше, не замена, см.
// lib/print-pdf.ts.
const isPrintingPdf = ref(false)
async function printDocumentPdf() {
  if (!contract.value) return
  isPrintingPdf.value = true
  downloadError.value = ''
  try {
    const blob = await fetchContractDocumentPdf(contract.value.id)
    await printPdfBlob(blob)
  } catch (error) {
    downloadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isPrintingPdf.value = false
  }
}

// --- Сторнирование платежа ---
const reversingPayment = ref<PaymentRow | null>(null)
const isReversing = ref(false)
const reverseError = ref('')

async function confirmReversePayment() {
  if (!reversingPayment.value) return
  isReversing.value = true
  reverseError.value = ''
  try {
    await reversePayment(reversingPayment.value.id)
    reversingPayment.value = null
    await load()
  } catch (error) {
    reverseError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isReversing.value = false
  }
}

</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex min-w-0 flex-wrap items-center gap-2">
      <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/contracts')">
        <ArrowLeft class="text-primary" />
        <span class="sr-only">{{ t('contracts.list.back') }}</span>
      </Button>
      <h1 class="min-w-0 break-words text-lg font-medium">
        {{ contract ? t('contracts.detail.titleWithNumber', { number: contract.number }) : t('contracts.detail.titleFallback') }}
      </h1>
      <ContractStatusPill v-if="contract" :status="contract.status" />
      <button v-if="contract" type="button" class="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" @click="openAccounting1cMapping">
        <Accounting1cLinkedBadge :linked="contract.accounting1cUid !== null && contract.accounting1cContractorUid !== null" />
      </button>
      <!-- Меню действий — тут же, на уровне номера договора (было отдельной тонкой строкой
           над карточкой, легко теряющейся), с текстовой подписью — заметнее, чем голая
           иконка (по прямой просьбе 2026-08-26). -->
      <DropdownMenu v-if="contract">
        <DropdownMenuTrigger as-child>
          <Button variant="outline" size="sm" class="ml-auto flex items-center gap-1.5">
            <MoreVertical class="size-4 text-primary" />
            {{ t('contracts.detail.actions') }}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem :disabled="isPrintingPdf" @click="printDocumentPdf">
            <Printer class="text-primary" />
            {{ t('contracts.detail.printContract') }}
          </DropdownMenuItem>
          <DropdownMenuItem :disabled="isDownloading" @click="downloadDocument">
            <Download class="text-primary" />
            {{ t('contracts.detail.downloadContract') }}
          </DropdownMenuItem>
          <DropdownMenuItem :disabled="contract.status === 'TERMINATED'" @click="openTerminate">
            <Ban class="text-red-500" />
            {{ t('contracts.detail.terminateContract') }}
          </DropdownMenuItem>
          <!-- Удаление доступно, только пока по договору не было ни одной оплаты — см.
               contract.hasPayments (backend блокирует то же самое на DELETE /contracts/:id). -->
          <DropdownMenuItem :disabled="contract.hasPayments" @click="openDelete">
            <Trash2 class="text-red-500" />
            {{ t('contracts.detail.deleteContract') }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <p v-if="loadError" class="text-sm text-red-500">{{ loadError }}</p>
    <p v-if="downloadError" class="text-sm text-red-500">{{ downloadError }}</p>
    <TableSkeleton v-if="isLoading && !contract" :columns="6" :rows="8" class="min-h-[60vh]" />

    <template v-if="contract">
      <div class="data-reveal flex flex-col gap-3">
        <Card class="flex flex-col gap-4 p-4">
          <div class="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <RouterLink
              :to="{ name: 'individual-detail', params: { uid: contract.residentIndividualUid } }"
              class="-mx-1.5 -my-0.5 flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <User class="size-4 shrink-0 text-primary" />
              {{ contract.residentFullName }}
            </RouterLink>
            <RoomInfoTrigger :room-id="contract.currentRoom?.id ?? null" :room-name="contract.currentRoom?.room ?? '-'" />
            <span class="flex items-center gap-1.5">
              <CalendarRange class="size-4 shrink-0 text-primary" />
              {{ formatDate(contract.startDate) }} - {{ formatDate(contract.actualEndDate ?? contract.endDate) }}
            </span>
            <!-- Дата создания — тут же, в карточке (была в общем заголовке страницы, но
                 там теперь меню действий, по прямой просьбе 2026-08-26). -->
            <span class="ml-auto flex items-center gap-1.5 text-muted-foreground">
              <History class="size-4 shrink-0 text-primary" />
              {{ t('contracts.detail.createdOn', { date: formatDate(contract.createdAt) }) }}
            </span>
          </div>

          <div class="grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-2 xl:grid-cols-5">
            <div class="flex items-center gap-3">
              <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-green-100 dark:bg-green-500/15">
                <Wallet class="size-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p class="text-xs text-muted-foreground">{{ t('contracts.detail.totalBalance') }}</p>
                <button
                  type="button"
                  class="rounded-sm text-lg font-semibold underline decoration-dotted underline-offset-2 hover:opacity-80"
                  :class="totalBalance > 0 ? 'text-red-500' : 'text-green-600'"
                  @click="isBalanceDialogOpen = true"
                >
                  {{ formatMoney(totalBalance) }}
                </button>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-500/15">
                <DoorOpen class="size-5 text-sky-600 dark:text-sky-400" />
              </div>
              <div>
                <p class="text-xs text-muted-foreground">{{ t('contracts.detail.roomCost') }}</p>
                <p class="text-lg font-medium">{{ isDailyOnlyContract ? t('contracts.detail.dailyRateOnly') : formatMoney(roomCost) }}</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-500/15">
                <Droplet class="size-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p class="text-xs text-muted-foreground">{{ t('contracts.detail.utilities') }}</p>
                <p class="text-lg font-medium">
                  {{ isDailyOnlyContract ? '-' : formatMoney(utilitiesAmount) }}
                </p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-500/15">
                <CalendarClock class="size-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <p class="text-xs text-muted-foreground">{{ t('contracts.detail.dailyRate') }}</p>
                <p class="text-lg font-medium">{{ formatMoney(contract.terms[0]?.dailyRateAmount ?? 0) }}</p>
              </div>
            </div>
            <!-- Кликабельна только сама сумма (открывает историю начисления по дням),
                 не весь тайл — тот же приём, что у резидента (MyContract.vue). -->
            <div class="flex items-center gap-3">
              <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-500/15">
                <Percent class="size-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p class="text-xs text-muted-foreground">{{ t('contracts.detail.penalty') }}</p>
                <button
                  type="button"
                  class="rounded-sm text-lg font-medium underline decoration-dotted underline-offset-2"
                  :class="contract.penaltyBalance > 0 ? 'text-red-500 hover:text-red-600' : 'hover:text-foreground/80'"
                  @click="isPenaltyDialogOpen = true"
                >
                  {{ formatMoney(contract.penaltyBalance) }}
                </button>
              </div>
            </div>
          </div>

          <div class="flex items-center border-t pt-4">
            <button
              type="button"
              class="flex w-fit shrink-0 items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground"
              @click="showParentInfo = !showParentInfo"
            >
              <Users class="size-4 text-primary" />
              {{ t('contracts.detail.parentInfo') }}
              <ChevronRight class="size-3.5 transition-transform" :class="showParentInfo ? '' : 'rotate-90'" />
            </button>
            <!-- Раскрывается вбок, а не вниз — grid-template-columns 0fr→1fr, тот же приём,
                 что и для вертикального раскрытия (grid-template-rows), только по другой оси:
                 высота содержимого не важна, а ширину неоткуда взять заранее без замера в JS. -->
            <div
              class="grid transition-[grid-template-columns] duration-200 ease-out"
              :class="showParentInfo ? 'grid-cols-[1fr]' : 'grid-cols-[0fr]'"
            >
              <div class="overflow-hidden">
                <div class="flex items-center gap-x-6 whitespace-nowrap pl-4 text-sm">
                  <span><span class="text-muted-foreground">{{ t('contracts.detail.fullName') }}</span> {{ contract.legalRepName ?? '-' }}</span>
                  <span><span class="text-muted-foreground">{{ t('contracts.detail.phone') }}</span> {{ contract.legalRepPhone ?? '-' }}</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Tabs v-model="activeTableTab" class="flex min-h-0 flex-1 flex-col">
        <TabsList class="w-fit self-start">
          <TabsTrigger value="accruals">
            <span class="flex items-center gap-1.5">
              <Receipt class="size-4 text-primary" />
              {{ t('contracts.detail.tabAccruals') }}
            </span>
          </TabsTrigger>
          <TabsTrigger value="payments">
            <span class="flex items-center gap-1.5">
              <Wallet class="size-4 text-primary" />
              {{ t('contracts.detail.tabPayments') }}
            </span>
          </TabsTrigger>
        </TabsList>

        <div class="flex flex-wrap items-center justify-between gap-2 pt-3">
          <div class="relative w-full max-w-xs">
            <Search class="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input v-model="activeSearch" :placeholder="t('entityTable.searchPlaceholder')" class="pl-8" />
          </div>
          <Button v-if="contract.refundableAmount > 0" size="sm" variant="outline" class="gap-1.5" @click="openRefund">
            <HandCoins class="size-4 text-primary" />
            {{ t('contracts.detail.recordRefund') }}
          </Button>
        </div>

        <TabsContent value="accruals" class="flex min-h-0 flex-1 flex-col">
          <Card class="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden py-0">
            <div class="flex min-h-0 flex-1 flex-col">
              <Table>
                <TableHeader class="sticky top-0 z-10 bg-muted">
                  <TableRow>
                    <TableHead
                      v-for="(col, i) in ACCRUAL_COLUMNS"
                      :key="col.id"
                      :class="i < ACCRUAL_COLUMNS.length - 1 ? CELL_BORDER_CLASS : ''"
                    >
                      <button
                        type="button"
                        class="flex w-full items-center gap-1.5 hover:text-foreground/80"
                        @click="toggleAccrualSort(col.id)"
                      >
                        {{ col.label }}
                        <component
                          :is="sortIcon(accrualSort, col.id)"
                          class="size-3.5 shrink-0"
                          :class="accrualSort.id === col.id ? '' : 'text-muted-foreground/50'"
                        />
                      </button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="a in filteredAccruals" :key="a.id" :class="a.voidedAt ? 'opacity-40' : ''">
                    <TableCell :class="CELL_BORDER_CLASS">{{ formatDate(a.periodStart) }} - {{ formatDate(a.periodEnd) }}</TableCell>
                    <TableCell :class="CELL_BORDER_CLASS">{{ formatDate(a.dueDate) }}</TableCell>
                    <TableCell :class="CELL_BORDER_CLASS">{{ formatMoney(a.total) }}</TableCell>
                    <TableCell :class="CELL_BORDER_CLASS">{{ a.adjustmentAmount ? formatMoney(a.adjustmentAmount) : '-' }}</TableCell>
                    <TableCell :class="CELL_BORDER_CLASS">
                      <div class="relative min-w-0" :class="a.paidRefundedAmount > 0 ? 'pb-5' : ''">
                        <span class="whitespace-nowrap">{{ formatMoney(a.paid) }}</span>
                        <span
                          v-if="a.paidRefundedAmount > 0"
                          class="absolute bottom-0 left-0 max-w-full truncate rounded bg-sky-100 px-1.5 py-0.5 text-[10px] leading-none text-sky-800 dark:bg-sky-500/15 dark:text-sky-300"
                          :title="t('contracts.detail.netOfRefundTitle', { amount: formatMoney(a.paidRefundedAmount) })"
                        >{{ t('contracts.detail.netOfRefund') }}</span>
                      </div>
                    </TableCell>
                    <TableCell :class="a.balance > 0 ? 'text-red-500' : ''">
                      {{ a.voidedAt ? t('contracts.detail.voided') : formatMoney(a.balance) }}
                    </TableCell>
                  </TableRow>
                  <TableRow v-if="!filteredAccruals.length">
                    <TableCell :colspan="ACCRUAL_COLUMNS.length" class="py-8 text-center text-muted-foreground">{{ t('entityTable.nothingFound') }}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="payments" class="flex min-h-0 flex-1 flex-col">
          <Card class="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden py-0">
            <p v-if="!paymentMovements.length" class="p-6 text-sm text-muted-foreground">{{ t('contracts.detail.noPaymentsYet') }}</p>
            <div v-else class="flex min-h-0 flex-1 flex-col">
              <Table>
                <TableHeader class="sticky top-0 z-10 bg-muted">
                  <TableRow>
                    <TableHead v-for="col in PAYMENT_COLUMNS" :key="col.id" :class="CELL_BORDER_CLASS">
                      <button
                        type="button"
                        class="flex w-full items-center gap-1.5 hover:text-foreground/80"
                        @click="togglePaymentSort(col.id)"
                      >
                        {{ col.label }}
                        <component
                          :is="sortIcon(paymentSort, col.id)"
                          class="size-3.5 shrink-0"
                          :class="paymentSort.id === col.id ? '' : 'text-muted-foreground/50'"
                        />
                      </button>
                    </TableHead>
                    <TableHead :class="CELL_BORDER_CLASS">{{ t('contracts.detail.colAccounting1c') }}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="p in filteredPayments" :key="`${p.isRefund ? 'refund' : 'payment'}-${p.id}`" :class="p.reversedAt ? 'opacity-40' : ''">
                    <TableCell :class="CELL_BORDER_CLASS">{{ formatDate(p.paidAt) }}</TableCell>
                    <TableCell :class="CELL_BORDER_CLASS">{{ formatMoney(p.amount) }}</TableCell>
                    <TableCell :class="CELL_BORDER_CLASS">{{ p.isRefund ? t('contracts.detail.refundMethod') : t(`payment.method.${p.method}`) }}</TableCell>
                    <TableCell :class="`${CELL_BORDER_CLASS} break-words`">{{ p.purpose ?? '-' }}</TableCell>
                    <TableCell :class="CELL_BORDER_CLASS">{{ p.rawComment ?? '-' }}</TableCell>
                    <TableCell :class="CELL_BORDER_CLASS">
                      <!-- Только для платежей с сайта (эквайринг) — MANUAL/IMPORTED_1C
                           никогда не отправляются этим потоком, см. billing/accounting-1c-push.service.ts. -->
                      <Accounting1cStatusPill
                        v-if="p.source === 'WEBSITE'"
                        :status="p.accounting1cSyncStatus ?? 'NOT_SYNCED'"
                        :error="p.accounting1cSyncError"
                        :synced-at="p.accounting1cSyncedAt"
                      />
                      <span v-else class="text-muted-foreground">-</span>
                    </TableCell>
                  </TableRow>
                  <TableRow v-if="!filteredPayments.length">
                    <TableCell :colspan="PAYMENT_COLUMNS.length + 1" class="py-8 text-center text-muted-foreground">{{ t('entityTable.nothingFound') }}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </template>

    <Dialog :open="isBalanceDialogOpen" @update:open="(open) => (isBalanceDialogOpen = open)">
      <DialogScrollContent :class="['flex w-[calc(100vw-2rem)] flex-col gap-3 sm:max-w-lg', DIALOG_ANIMATE_CLASS]">
        <DialogHeader><DialogTitle>{{ t('contracts.detail.balanceDetails') }}</DialogTitle></DialogHeader>
        <div class="rounded-xl border bg-muted/40 p-4">
          <p class="text-xs text-muted-foreground">{{ t('contracts.detail.totalBalance') }}</p>
          <p class="mt-1 text-2xl font-semibold tabular-nums" :class="totalBalance > 0 ? 'text-red-500' : 'text-green-600'">
            {{ formatMoney(totalBalance) }}
          </p>
        </div>
        <div v-if="correctionTotal > 0 || totalBalance < 0" class="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div v-if="correctionTotal > 0" class="rounded-lg border p-3">
            <p class="text-xs text-muted-foreground">{{ t('contracts.detail.totalCorrection') }}</p>
            <p class="mt-1 font-medium tabular-nums">{{ formatMoney(-correctionTotal) }}</p>
          </div>
          <div v-if="totalBalance < 0" class="rounded-lg border p-3">
            <p class="text-xs text-muted-foreground">{{ t('contracts.detail.contractOverpayment') }}</p>
            <p class="mt-1 font-medium tabular-nums">{{ formatMoney(-totalBalance) }}</p>
          </div>
        </div>
        <div class="rounded-xl border p-4">
          <div class="flex items-center justify-between gap-3">
            <h3 class="text-sm font-medium">{{ t('contracts.detail.availableRefund') }}</h3>
            <strong class="whitespace-nowrap text-lg tabular-nums">{{ formatMoney(contract?.refundableAmount ?? 0) }}</strong>
          </div>
          <div v-if="contract && contract.refundableAmount > 0" class="mt-3 grid grid-cols-1 gap-2 border-t pt-3 sm:grid-cols-2">
            <div v-if="contract.refundSources.correctionAmount > 0" class="rounded-md bg-muted/50 p-2.5">
              <p class="text-xs text-muted-foreground">{{ t('contracts.detail.refundCorrection') }}</p>
              <p class="mt-1 font-medium tabular-nums">{{ formatMoney(contract.refundSources.correctionAmount) }}</p>
            </div>
            <div v-if="contract.refundSources.overpaymentAmount > 0" class="rounded-md bg-muted/50 p-2.5">
              <p class="text-xs text-muted-foreground">{{ t('contracts.detail.extraOverpayment') }}</p>
              <p class="mt-1 font-medium tabular-nums">{{ formatMoney(contract.refundSources.overpaymentAmount) }}</p>
            </div>
          </div>
        </div>
        <div v-if="refundedTotal > 0" class="rounded-xl border p-4">
          <div class="flex items-center justify-between gap-3">
            <h3 class="text-sm font-medium">{{ t('contracts.detail.alreadyRefunded') }}</h3>
            <strong class="whitespace-nowrap text-lg tabular-nums">{{ formatMoney(refundedTotal) }}</strong>
          </div>
          <div class="mt-3 grid grid-cols-1 gap-2 border-t pt-3 sm:grid-cols-2">
            <div v-if="refundedCorrection > 0" class="rounded-md bg-muted/50 p-2.5">
              <p class="text-xs text-muted-foreground">{{ t('contracts.detail.refundCorrection') }}</p>
              <p class="mt-1 font-medium tabular-nums">{{ formatMoney(refundedCorrection) }}</p>
            </div>
            <div v-if="refundedTotal - refundedCorrection > 0" class="rounded-md bg-muted/50 p-2.5">
              <p class="text-xs text-muted-foreground">{{ t('contracts.detail.extraOverpayment') }}</p>
              <p class="mt-1 font-medium tabular-nums">{{ formatMoney(refundedTotal - refundedCorrection) }}</p>
            </div>
          </div>
        </div>
      </DialogScrollContent>
    </Dialog>

    <Dialog :open="isRefundOpen" @update:open="(open) => (isRefundOpen = open)">
      <DialogScrollContent :class="['flex w-[calc(100vw-2rem)] flex-col gap-4 sm:max-w-lg', DIALOG_ANIMATE_CLASS]">
        <DialogHeader><DialogTitle>{{ t('contracts.detail.recordRefund') }}</DialogTitle></DialogHeader>
        <div class="flex flex-col gap-2">
          <Label>{{ t('contracts.detail.refundSource') }}</Label>
          <Collapsible v-model:open="refundPickerOpen">
            <CollapsibleTrigger as-child>
              <button type="button" class="flex h-10 w-full items-center justify-between gap-2 rounded-md border px-3 text-sm hover:bg-accent">
                <span class="min-w-0 truncate">{{ refundSelectionSummary }}</span>
                <span class="flex shrink-0 items-center gap-1.5 font-medium">
                  {{ formatMoney(selectedRefundAmount) }}
                  <ChevronDown class="size-3.5 text-muted-foreground transition-transform duration-200" :class="refundPickerOpen ? 'rotate-180' : ''" />
                </span>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent class="flex flex-col gap-2 pt-2">
              <div v-if="contract?.refundSources.correctionAmount" class="rounded-md border p-2.5">
                <label class="flex cursor-pointer items-center justify-between gap-2 text-sm">
                  <span class="flex items-center gap-2"><Checkbox v-model="includeCorrection" />{{ t('contracts.detail.refundCorrection') }}</span>
                  <span>{{ formatMoney(contract.refundSources.correctionAmount) }}</span>
                </label>
                <div v-if="includeCorrection" class="mt-2 flex items-center gap-2">
                  <Label for="refund-correction-amount" class="min-w-0 flex-1 text-xs text-muted-foreground">{{ t('contracts.detail.amount') }}</Label>
                  <Input id="refund-correction-amount" v-model="correctionRefundAmount" class="w-32" type="text" inputmode="decimal" />
                </div>
              </div>
              <div v-if="contract?.refundSources.overpaymentAmount" class="rounded-md border p-2.5">
                <label class="flex cursor-pointer items-center justify-between gap-2 text-sm">
                  <span class="flex items-center gap-2"><Checkbox v-model="includeOverpayment" />{{ t('contracts.detail.extraOverpayment') }}</span>
                  <span>{{ formatMoney(contract.refundSources.overpaymentAmount) }}</span>
                </label>
                <div v-if="includeOverpayment" class="mt-2 flex items-center gap-2">
                  <Label for="refund-overpayment-amount" class="min-w-0 flex-1 text-xs text-muted-foreground">{{ t('contracts.detail.amount') }}</Label>
                  <Input id="refund-overpayment-amount" v-model="overpaymentRefundAmount" class="w-32" type="text" inputmode="decimal" />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
          <div class="flex items-center justify-between text-sm">
            <span>{{ t('contracts.detail.refundTotal') }}</span>
            <strong>{{ formatMoney(selectedRefundAmount) }}</strong>
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <Label>{{ t('contracts.detail.date') }}</Label>
          <DatePickerField v-model="refundDate" />
        </div>
        <div class="flex flex-col gap-2">
          <Label for="refund-comment">{{ t('contracts.detail.comment') }}</Label>
          <Input id="refund-comment" v-model="refundComment" maxlength="1000" />
        </div>
        <p v-if="refundError" class="text-sm text-red-500">{{ refundError }}</p>
        <DialogFooter>
          <Button variant="outline" @click="isRefundOpen = false">{{ t('contracts.detail.cancel') }}</Button>
          <Button :loading="isSavingRefund" @click="saveRefund">{{ t('contracts.detail.save') }}</Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>

    <Dialog :open="isTerminateOpen" @update:open="(open) => (isTerminateOpen = open)">
      <DialogScrollContent :class="['flex flex-col gap-4', DIALOG_ANIMATE_CLASS]">
        <DialogHeader>
          <DialogTitle>{{ t('contracts.detail.terminateDialogTitle') }}</DialogTitle>
        </DialogHeader>
        <div class="flex flex-col gap-2">
          <Label>{{ t('contracts.detail.actualEndDate') }}</Label>
          <DatePickerField v-model="actualEndDate" />
        </div>
        <p v-if="terminateError" class="text-sm text-red-500">{{ terminateError }}</p>
        <DialogFooter>
          <Button variant="outline" @click="isTerminateOpen = false">{{ t('contracts.detail.cancel') }}</Button>
          <Button :loading="isTerminating" @click="submitTerminate">{{ t('contracts.detail.terminate') }}</Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>

    <Dialog :open="isDeleteOpen" @update:open="(open) => (isDeleteOpen = open)">
      <DialogScrollContent :class="['flex flex-col gap-4', DIALOG_ANIMATE_CLASS]">
        <DialogHeader>
          <DialogTitle>{{ t('contracts.detail.deleteDialogTitle') }}</DialogTitle>
          <DialogDescription>
            {{ t('contracts.detail.deleteDialogDescription', { number: contract?.number ?? '' }) }}
          </DialogDescription>
        </DialogHeader>
        <p v-if="deleteError" class="text-sm text-red-500">{{ deleteError }}</p>
        <DialogFooter>
          <Button variant="outline" @click="isDeleteOpen = false">{{ t('contracts.detail.cancel') }}</Button>
          <Button
            variant="outline"
            class="border-red-500 text-red-500 hover:text-red-500"
            :loading="isDeleting"
            @click="submitDelete"
          >
            {{ t('contracts.detail.confirmDelete') }}
          </Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>

    <Dialog :open="reversingPayment !== null" @update:open="(v) => { if (!v) reversingPayment = null }">
      <DialogScrollContent :class="['flex flex-col gap-4', DIALOG_ANIMATE_CLASS]">
        <DialogHeader>
          <DialogTitle>{{ t('contracts.detail.reverseDialogTitle') }}</DialogTitle>
          <DialogDescription>
            {{
              t('contracts.detail.reverseDialogDescription', {
                amount: reversingPayment ? formatMoney(reversingPayment.amount) : '',
                date: reversingPayment ? formatDate(reversingPayment.paidAt) : '',
              })
            }}
          </DialogDescription>
        </DialogHeader>
        <p v-if="reverseError" class="text-sm text-red-500">{{ reverseError }}</p>
        <DialogFooter>
          <Button variant="outline" @click="reversingPayment = null">{{ t('contracts.detail.cancel') }}</Button>
          <Button
            variant="outline"
            class="border-red-500 text-red-500 hover:text-red-500"
            :loading="isReversing"
            @click="confirmReversePayment"
          >
            {{ t('contracts.detail.confirmReverse') }}
          </Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>

    <Dialog :open="isPenaltyDialogOpen" @update:open="(open) => (isPenaltyDialogOpen = open)">
      <DialogScrollContent class="flex max-h-[85vh] flex-col sm:max-w-md">
        <DialogHeader>
          <div class="flex items-center justify-between gap-2 pr-6">
            <DialogTitle class="flex items-center gap-1.5">
              <Percent class="size-4 text-orange-500" />
              {{ t('contracts.myContract.penaltyHistoryTitle') }}
            </DialogTitle>
            <Button variant="outline" size="sm" :loading="isRecalculatingPenalty" @click="submitRecalculatePenalty">
              <RotateCw class="size-3.5" />
              {{ t('contracts.detail.recalculatePenalty') }}
            </Button>
          </div>
          <DialogDescription>
            {{ t('contracts.myContract.penaltyHistoryDescription') }}
          </DialogDescription>
        </DialogHeader>
        <p v-if="recalculatePenaltyError" class="text-sm text-red-500">{{ recalculatePenaltyError }}</p>
        <div class="relative min-h-5 min-w-0">
          <div v-if="visiblePenaltyLog.length" class="-mx-1 space-y-1 overflow-y-auto px-1" :class="{ invisible: isRecalculatingPenalty }" style="max-height: 50vh">
            <div
              v-for="row in visiblePenaltyLog"
              :key="row.date"
              class="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm"
            >
              <div>
                <p class="font-medium">{{ formatDate(row.date) }}</p>
                <p class="text-xs text-muted-foreground">
                  {{ t('contracts.myContract.penaltyLine', { rate: PENALTY_DAILY_RATE_PERCENT, amount: formatMoney(row.overdueBase) }) }}
                </p>
              </div>
              <span class="font-medium text-orange-600 dark:text-orange-400">+{{ formatMoney(row.amount) }}</span>
            </div>
          </div>
          <p v-else :class="{ invisible: isRecalculatingPenalty }" class="text-sm text-muted-foreground">{{ t('contracts.myContract.penaltyNeverAccrued') }}</p>
          <div v-if="isRecalculatingPenalty" class="absolute inset-0 space-y-2 overflow-hidden bg-background" aria-busy="true">
            <Skeleton v-if="!visiblePenaltyLog.length" class="h-5 w-48 max-w-full" />
            <Skeleton v-for="index in Math.min(visiblePenaltyLog.length, 8)" :key="index" class="h-14 w-full" />
          </div>
        </div>
      </DialogScrollContent>
    </Dialog>
    <Accounting1cMappingDialog ref="mappingDialogRef" @saved="load" />
  </div>
</template>
