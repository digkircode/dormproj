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
  ChevronRight,
  DoorOpen,
  Download,
  Droplet,
  History,
  MoreVertical,
  Percent,
  Printer,
  Receipt,
  RotateCw,
  Trash2,
  User,
  Users,
  Wallet,
} from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import ContractStatusPill from '@/components/ContractStatusPill.vue'
import Accounting1cLinkedBadge from '@/components/Accounting1cLinkedBadge.vue'
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
import { reversePayment, syncPaymentToAccounting1c, recalculatePenalty } from '@/lib/billing-api'
import Accounting1cStatusPill from '@/components/Accounting1cStatusPill.vue'
import { fetchDormitoryInfo, type DormitoryInfo } from '@/lib/dormitory-info-api'
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

// Коммунальные услуги — не сумма по договору (в rentAmount уже включены, отдельно от
// начислений не хранятся, см. rentAmount ниже), а справочная общежитская величина —
// просто показать текущую стоимость, ничего никуда не прибавляя.
const dormInfo = ref<DormitoryInfo | null>(null)
onMounted(async () => {
  dormInfo.value = await fetchDormitoryInfo()
})

// Пеня — единая сумма на договор (не входит в accrual.balance, см. penalty-balance.ts на
// бэке) — добавляем её отдельно, иначе общий баланс не совпадал бы с реальным долгом.
const totalBalance = computed(() =>
  contract.value ? contract.value.accruals.reduce((sum, a) => sum + a.balance, 0) + contract.value.penaltyBalance : 0,
)

// История начисления пени по дням — раскрывается кликом по тайлу "Пени" (тот же приём,
// что и у резидента, см. MyContract.vue), плюс кнопка "Пересчитать" для сотрудника
// (2026-09-05, billing.controller.ts#recalculatePenalty) — полная пересборка журнала пени
// договора с нуля тем же дневным расчётом, что и ночной крон (нужно для договоров, чью
// историю пени крон мог посчитать неверно ДО фикса дневного расчёта, см. промпт проекта).
const isPenaltyDialogOpen = ref(false)
const PENALTY_DAILY_RATE_PERCENT = '0,14%'
const isRecalculatingPenalty = ref(false)
const recalculatePenaltyError = ref('')
async function submitRecalculatePenalty() {
  isRecalculatingPenalty.value = true
  recalculatePenaltyError.value = ''
  try {
    await recalculatePenalty(contractId.value)
    await load()
  } catch (error) {
    recalculatePenaltyError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isRecalculatingPenalty.value = false
  }
}
// Коммунальные услуги в БД уже включены в стоимость комнаты (Room → характеристика
// "Стоимость (из/не из вуза)"), которая и попадает в rentAmount при создании договора —
// отдельно прибавлять utilitiesAmount не нужно, это задвоило бы сумму.
const rentAmount = computed(() => contract.value?.terms[0]?.rentAmount ?? 0)
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
function useLocalSort<T extends Record<string, unknown>>(rows: () => T[], initialId: string) {
  const sort = ref({ id: initialId, desc: false })
  const sorted = computed(() => {
    const { id, desc } = sort.value
    return [...rows()].sort((a, b) => {
      const av = a[id]
      const bv = b[id]
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
  { id: 'rentAmount', label: t('contracts.detail.colRent') },
  { id: 'adjustmentAmount', label: t('contracts.detail.colAdjustment') },
  { id: 'paid', label: t('contracts.detail.colPaid') },
  { id: 'balance', label: t('contracts.detail.colBalance') },
])
const { sort: accrualSort, sorted: sortedAccruals, toggle: toggleAccrualSort } = useLocalSort(
  () => contract.value?.accruals ?? [],
  'periodStart' satisfies keyof AccrualRow,
)

const PAYMENT_COLUMNS = computed<{ id: keyof PaymentRow; label: string }[]>(() => [
  { id: 'paidAt', label: t('contracts.detail.colDate') },
  { id: 'amount', label: t('contracts.detail.colAmount') },
  { id: 'method', label: t('contracts.detail.colMethod') },
  { id: 'purpose', label: t('contracts.detail.colPurpose') },
  { id: 'rawComment', label: t('contracts.detail.colComment') },
])
const { sort: paymentSort, sorted: sortedPayments, toggle: togglePaymentSort } = useLocalSort(
  () => contract.value?.payments ?? [],
  'paidAt' satisfies keyof PaymentRow,
)

function formatDate(value: string | null): string {
  if (!value) return '—'
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
  actualEndDate.value = new Date().toISOString().slice(0, 10)
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

function openReverseConfirm(payment: PaymentRow) {
  reversingPayment.value = payment
  reverseError.value = ''
}
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

// --- Повтор отправки в 1С Бухгалтерию (флоу 1) ---
const retryingAccounting1cId = ref<number | null>(null)
async function retrySyncToAccounting1c(payment: PaymentRow) {
  retryingAccounting1cId.value = payment.id
  try {
    await syncPaymentToAccounting1c(payment.id)
    await load()
  } catch (error) {
    // Тихий best-effort, как и вся отправка в 1С — платёж уже проведён независимо от
    // этого статуса, ошибку показываем прямо в пилюле (accounting1cSyncError с бэка
    // после load()), отдельный алерт/тост не нужен.
    console.error(error)
  } finally {
    retryingAccounting1cId.value = null
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/contracts')">
        <ArrowLeft class="text-primary" />
        <span class="sr-only">{{ t('contracts.list.back') }}</span>
      </Button>
      <h1 class="text-lg font-medium">
        {{ contract ? t('contracts.detail.titleWithNumber', { number: contract.number }) : t('contracts.detail.titleFallback') }}
      </h1>
      <ContractStatusPill v-if="contract" :status="contract.status" />
      <Accounting1cLinkedBadge v-if="contract" :linked="contract.accounting1cUid !== null" />
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
          <DropdownMenuItem :disabled="contract.status !== 'ACTIVE'" @click="openTerminate">
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
    <p v-if="isLoading" class="text-sm text-muted-foreground">{{ t('entityTable.loading') }}</p>

    <template v-if="contract">
      <div class="flex flex-col gap-3">
        <Card class="flex flex-col gap-4 p-4">
          <div class="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <RouterLink
              :to="{ name: 'individual-detail', params: { uid: contract.residentIndividualUid } }"
              class="-mx-1.5 -my-0.5 flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <User class="size-4 shrink-0 text-primary" />
              {{ contract.residentFullName }}
            </RouterLink>
            <RoomInfoTrigger :room-id="contract.currentRoom?.id ?? null" :room-name="contract.currentRoom?.room ?? '—'" />
            <span class="flex items-center gap-1.5">
              <CalendarRange class="size-4 shrink-0 text-primary" />
              {{ formatDate(contract.startDate) }} — {{ formatDate(contract.actualEndDate ?? contract.endDate) }}
            </span>
            <!-- Дата создания — тут же, в карточке (была в общем заголовке страницы, но
                 там теперь меню действий, по прямой просьбе 2026-08-26). -->
            <span class="ml-auto flex items-center gap-1.5 text-muted-foreground">
              <History class="size-4 shrink-0 text-primary" />
              {{ t('contracts.detail.createdOn', { date: formatDate(contract.createdAt) }) }}
            </span>
          </div>

          <div class="grid grid-cols-5 gap-4 border-t pt-4">
            <div class="flex items-center gap-3">
              <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-green-100 dark:bg-green-500/15">
                <Wallet class="size-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p class="text-xs text-muted-foreground">{{ t('contracts.detail.totalBalance') }}</p>
                <p class="text-lg font-semibold" :class="totalBalance > 0 ? 'text-red-500' : 'text-green-600'">
                  {{ formatMoney(totalBalance) }}
                </p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-500/15">
                <DoorOpen class="size-5 text-sky-600 dark:text-sky-400" />
              </div>
              <div>
                <p class="text-xs text-muted-foreground">{{ t('contracts.detail.roomCost') }}</p>
                <p class="text-lg font-medium">{{ isDailyOnlyContract ? t('contracts.detail.dailyRateOnly') : formatMoney(rentAmount) }}</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-500/15">
                <Droplet class="size-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p class="text-xs text-muted-foreground">{{ t('contracts.detail.utilities') }}</p>
                <p class="text-lg font-medium">
                  {{ dormInfo?.communalServicesCost != null ? formatMoney(dormInfo.communalServicesCost) : '—' }}
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
                  <span><span class="text-muted-foreground">{{ t('contracts.detail.fullName') }}</span> {{ contract.legalRepName ?? '—' }}</span>
                  <span><span class="text-muted-foreground">{{ t('contracts.detail.phone') }}</span> {{ contract.legalRepPhone ?? '—' }}</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Tabs default-value="accruals" class="flex min-h-0 flex-1 flex-col">
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
                  <TableRow v-for="a in sortedAccruals" :key="a.id" :class="a.voidedAt ? 'opacity-40' : ''">
                    <TableCell :class="CELL_BORDER_CLASS">{{ formatDate(a.periodStart) }} — {{ formatDate(a.periodEnd) }}</TableCell>
                    <TableCell :class="CELL_BORDER_CLASS">{{ formatDate(a.dueDate) }}</TableCell>
                    <TableCell :class="CELL_BORDER_CLASS">{{ formatMoney(a.rentAmount) }}</TableCell>
                    <TableCell :class="CELL_BORDER_CLASS">{{ a.adjustmentAmount ? formatMoney(a.adjustmentAmount) : '—' }}</TableCell>
                    <TableCell :class="CELL_BORDER_CLASS">{{ formatMoney(a.paid) }}</TableCell>
                    <TableCell :class="a.balance > 0 ? 'text-red-500' : ''">
                      {{ a.voidedAt ? t('contracts.detail.voided') : formatMoney(a.balance) }}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="payments" class="flex min-h-0 flex-1 flex-col">
          <Card class="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden py-0">
            <p v-if="!contract.payments.length" class="p-6 text-sm text-muted-foreground">{{ t('contracts.detail.noPaymentsYet') }}</p>
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
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="p in sortedPayments" :key="p.id" :class="p.reversedAt ? 'opacity-40' : ''">
                    <TableCell :class="CELL_BORDER_CLASS">{{ formatDate(p.paidAt) }}</TableCell>
                    <TableCell :class="CELL_BORDER_CLASS">{{ formatMoney(p.amount) }}</TableCell>
                    <TableCell :class="CELL_BORDER_CLASS">{{ t(`payment.method.${p.method}`) }}</TableCell>
                    <TableCell :class="CELL_BORDER_CLASS">{{ p.purpose ?? '—' }}</TableCell>
                    <TableCell :class="CELL_BORDER_CLASS">{{ p.rawComment ?? '—' }}</TableCell>
                    <TableCell :class="CELL_BORDER_CLASS">
                      <!-- Только для платежей с сайта (эквайринг) — MANUAL/IMPORTED_1C
                           никогда не отправляются этим потоком, см. billing/accounting-1c-push.service.ts. -->
                      <Accounting1cStatusPill
                        v-if="p.source === 'WEBSITE'"
                        :status="p.accounting1cSyncStatus ?? 'NOT_SYNCED'"
                        :error="p.accounting1cSyncError"
                        :synced-at="p.accounting1cSyncedAt"
                        :retrying="retryingAccounting1cId === p.id"
                        @retry="retrySyncToAccounting1c(p)"
                      />
                      <span v-else class="text-muted-foreground">—</span>
                    </TableCell>
                    <TableCell class="text-right">
                      <span v-if="p.reversedAt" class="text-xs text-muted-foreground">{{ t('contracts.detail.reversed') }}</span>
                      <Button v-else variant="ghost" size="icon" class="size-7" @click="openReverseConfirm(p)">
                        <Ban class="text-red-500" />
                        <span class="sr-only">{{ t('contracts.detail.reverse') }}</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </template>

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
        <div v-if="contract?.penaltyLog.length" class="-mx-1 flex-1 space-y-1 overflow-y-auto px-1" style="max-height: 50vh">
          <div
            v-for="row in contract.penaltyLog"
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
        <p v-else class="text-sm text-muted-foreground">{{ t('contracts.myContract.penaltyNeverAccrued') }}</p>
      </DialogScrollContent>
    </Dialog>
  </div>
</template>
