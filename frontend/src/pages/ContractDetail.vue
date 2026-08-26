<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
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
  Droplet,
  History,
  MoreVertical,
  Percent,
  Plus,
  Printer,
  Receipt,
  Trash2,
  User,
  Users,
  Wallet,
} from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import ContractStatusPill from '@/components/ContractStatusPill.vue'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogScrollContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import DatePickerField from '@/components/DatePickerField.vue'
import RoomInfoTrigger from '@/components/RoomInfoTrigger.vue'
import {
  fetchContractDetail,
  terminateContract,
  deleteContract,
  downloadContractDocument,
  type AccrualRow,
  type ContractDetail,
  type PaymentMethod,
  type PaymentRow,
} from '@/lib/contracts-api'
import { createPayment, reversePayment } from '@/lib/billing-api'
import { fetchDormitoryInfo, type DormitoryInfo } from '@/lib/dormitory-info-api'
import { getContractDisplayStatus } from '@/lib/contracts-format'
import { blockNonNumericKeys, goBack } from '@/lib/utils'
import { breadcrumbOverride } from '@/lib/breadcrumb-state'

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
// Вертикальные разделители колонок — тот же приём, что и в общей таблице (EntityTable.vue),
// для визуального единства всех таблиц в приложении.
const CELL_BORDER_CLASS = 'border-r border-border last:border-r-0'
// Скрывает нативные стрелочки +/- у <input type="number"> — та же константа, что в
// Rooms.vue/RoomDetailPanel.vue/Contracts.vue (не выносили в общий модуль и там, см. промпт
// проекта — этот повтор по той же причине).
const NO_SPINNER_CLASS = '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Наличные',
  CARD_ACQUIRING: 'Эквайринг',
  BANK_TRANSFER: 'Банковский перевод',
  MAT_CAPITAL: 'Материнский капитал',
  WEBSITE: 'Сайт',
}

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
    breadcrumbOverride.value = `Договор № ${contract.value.number}`
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

// Тот же вычисляемый бакет "Истекает" (ACTIVE + endDate в пределах 30 дней), что и в
// списке договоров/Финансовом отчёте (см. contracts-format.ts) — на карточке договора
// раньше в пилюлю уходил сырой contract.status, EXPIRING никогда не показывался.
const displayStatus = computed(() => (contract.value ? getContractDisplayStatus(contract.value.status, contract.value.endDate) : null))

// Пеня — единая сумма на договор (не входит в accrual.balance, см. penalty-balance.ts на
// бэке) — добавляем её отдельно, иначе общий баланс не совпадал бы с реальным долгом.
const totalBalance = computed(() =>
  contract.value ? contract.value.accruals.reduce((sum, a) => sum + a.balance, 0) + contract.value.penaltyBalance : 0,
)
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

const ACCRUAL_COLUMNS: { id: keyof AccrualRow; label: string }[] = [
  { id: 'periodStart', label: 'Период' },
  { id: 'dueDate', label: 'Срок оплаты' },
  { id: 'rentAmount', label: 'Найм' },
  { id: 'adjustmentAmount', label: 'Корректировка' },
  { id: 'paid', label: 'Оплачено' },
  { id: 'balance', label: 'Остаток' },
]
const { sort: accrualSort, sorted: sortedAccruals, toggle: toggleAccrualSort } = useLocalSort(
  () => contract.value?.accruals ?? [],
  'periodStart' satisfies keyof AccrualRow,
)

const PAYMENT_COLUMNS: { id: keyof PaymentRow; label: string }[] = [
  { id: 'paidAt', label: 'Дата' },
  { id: 'amount', label: 'Сумма' },
  { id: 'method', label: 'Способ' },
  { id: 'rawComment', label: 'Комментарий' },
]
const { sort: paymentSort, sorted: sortedPayments, toggle: togglePaymentSort } = useLocalSort(
  () => contract.value?.payments ?? [],
  'paidAt' satisfies keyof PaymentRow,
)

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('ru-RU')
}
function formatMoney(value: number): string {
  return `${value.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`
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

// --- Внесение платежа ---
const isPaymentOpen = ref(false)
const paymentAmount = ref<number | undefined>(undefined)
const paymentDate = ref('')
const paymentMethod = ref<PaymentMethod>('CASH')
const paymentComment = ref('')
const paymentError = ref('')
const isSavingPayment = ref(false)

function openPayment() {
  // Подставляем месячную сумму (стоимость комнаты), а не весь накопленный долг —
  // по умолчанию вносят обычный ежемесячный платёж, а не гасят всё сразу.
  paymentAmount.value = rentAmount.value > 0 ? rentAmount.value : undefined
  paymentDate.value = new Date().toISOString().slice(0, 10)
  paymentMethod.value = 'CASH'
  paymentComment.value = ''
  paymentError.value = ''
  isPaymentOpen.value = true
}
async function submitPayment() {
  if (!paymentAmount.value || paymentAmount.value <= 0 || !paymentDate.value) {
    paymentError.value = 'Укажите сумму и дату'
    return
  }
  isSavingPayment.value = true
  paymentError.value = ''
  try {
    await createPayment(contractId.value, {
      amount: paymentAmount.value,
      paidAt: paymentDate.value,
      method: paymentMethod.value,
      rawComment: paymentComment.value.trim() || null,
    })
    isPaymentOpen.value = false
    await load()
  } catch (error) {
    paymentError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isSavingPayment.value = false
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
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/contracts')">
        <ArrowLeft class="text-primary" />
        <span class="sr-only">Назад</span>
      </Button>
      <h1 class="text-lg font-medium">{{ contract ? `Договор № ${contract.number}` : 'Договор' }}</h1>
      <ContractStatusPill v-if="displayStatus" :status="displayStatus" />
      <!-- Меню действий — тут же, на уровне номера договора (было отдельной тонкой строкой
           над карточкой, легко теряющейся), с текстовой подписью — заметнее, чем голая
           иконка (по прямой просьбе 2026-08-26). -->
      <DropdownMenu v-if="contract">
        <DropdownMenuTrigger as-child>
          <Button variant="outline" size="sm" class="ml-auto flex items-center gap-1.5">
            <MoreVertical class="size-4 text-primary" />
            Действия
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem :disabled="isDownloading" @click="downloadDocument">
            <Printer class="text-primary" />
            Печать договора
          </DropdownMenuItem>
          <DropdownMenuItem @click="openPayment">
            <Plus class="text-primary" />
            Внести платёж
          </DropdownMenuItem>
          <DropdownMenuItem :disabled="contract.status !== 'ACTIVE'" @click="openTerminate">
            <Ban class="text-red-500" />
            Расторгнуть договор
          </DropdownMenuItem>
          <!-- Удаление доступно, только пока по договору не было ни одной оплаты — см.
               contract.hasPayments (backend блокирует то же самое на DELETE /contracts/:id). -->
          <DropdownMenuItem :disabled="contract.hasPayments" @click="openDelete">
            <Trash2 class="text-red-500" />
            Удалить договор
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <p v-if="loadError" class="text-sm text-red-500">{{ loadError }}</p>
    <p v-if="downloadError" class="text-sm text-red-500">{{ downloadError }}</p>
    <p v-if="isLoading" class="text-sm text-muted-foreground">Загрузка…</p>

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
              Создан {{ formatDate(contract.createdAt) }}
            </span>
          </div>

          <div class="grid grid-cols-5 gap-4 border-t pt-4">
            <div class="flex items-center gap-3">
              <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-green-100 dark:bg-green-500/15">
                <Wallet class="size-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p class="text-xs text-muted-foreground">Общий баланс</p>
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
                <p class="text-xs text-muted-foreground">Стоимость комнаты</p>
                <p class="text-lg font-medium">{{ isDailyOnlyContract ? 'Посуточно' : formatMoney(rentAmount) }}</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-500/15">
                <Droplet class="size-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p class="text-xs text-muted-foreground">Коммунальные услуги</p>
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
                <p class="text-xs text-muted-foreground">Суточная ставка</p>
                <p class="text-lg font-medium">{{ formatMoney(contract.terms[0]?.dailyRateAmount ?? 0) }}</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-500/15">
                <Percent class="size-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p class="text-xs text-muted-foreground">Пени</p>
                <p class="text-lg font-medium" :class="contract.penaltyBalance > 0 ? 'text-red-500' : ''">
                  {{ formatMoney(contract.penaltyBalance) }}
                </p>
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
              Информация о родителе
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
                  <span><span class="text-muted-foreground">ФИО:</span> {{ contract.legalRepName ?? '—' }}</span>
                  <span><span class="text-muted-foreground">Телефон:</span> {{ contract.legalRepPhone ?? '—' }}</span>
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
              Начисления
            </span>
          </TabsTrigger>
          <TabsTrigger value="payments">
            <span class="flex items-center gap-1.5">
              <Wallet class="size-4 text-primary" />
              Платежи
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
                      {{ a.voidedAt ? 'отменено' : formatMoney(a.balance) }}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="payments" class="flex min-h-0 flex-1 flex-col">
          <Card class="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden py-0">
            <p v-if="!contract.payments.length" class="p-6 text-sm text-muted-foreground">Платежей пока нет</p>
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
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="p in sortedPayments" :key="p.id" :class="p.reversedAt ? 'opacity-40' : ''">
                    <TableCell :class="CELL_BORDER_CLASS">{{ formatDate(p.paidAt) }}</TableCell>
                    <TableCell :class="CELL_BORDER_CLASS">{{ formatMoney(p.amount) }}</TableCell>
                    <TableCell :class="CELL_BORDER_CLASS">{{ METHOD_LABELS[p.method] ?? p.method }}</TableCell>
                    <TableCell :class="CELL_BORDER_CLASS">{{ p.rawComment ?? '—' }}</TableCell>
                    <TableCell class="text-right">
                      <span v-if="p.reversedAt" class="text-xs text-muted-foreground">сторнирован</span>
                      <Button v-else variant="ghost" size="icon" class="size-7" @click="openReverseConfirm(p)">
                        <Ban class="text-red-500" />
                        <span class="sr-only">Сторнировать</span>
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
          <DialogTitle>Расторгнуть договор</DialogTitle>
        </DialogHeader>
        <div class="flex flex-col gap-2">
          <Label>Фактическая дата выезда</Label>
          <DatePickerField v-model="actualEndDate" />
        </div>
        <p v-if="terminateError" class="text-sm text-red-500">{{ terminateError }}</p>
        <DialogFooter>
          <Button variant="outline" @click="isTerminateOpen = false">Отмена</Button>
          <Button :loading="isTerminating" @click="submitTerminate">Расторгнуть</Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>

    <Dialog :open="isDeleteOpen" @update:open="(open) => (isDeleteOpen = open)">
      <DialogScrollContent :class="['flex flex-col gap-4', DIALOG_ANIMATE_CLASS]">
        <DialogHeader>
          <DialogTitle>Удалить договор?</DialogTitle>
          <DialogDescription>
            Договор № {{ contract?.number }} будет удалён из базы безвозвратно вместе со всеми начислениями и историей
            заселения. Отменить это действие нельзя.
          </DialogDescription>
        </DialogHeader>
        <p v-if="deleteError" class="text-sm text-red-500">{{ deleteError }}</p>
        <DialogFooter>
          <Button variant="outline" @click="isDeleteOpen = false">Отмена</Button>
          <Button
            variant="outline"
            class="border-red-500 text-red-500 hover:text-red-500"
            :loading="isDeleting"
            @click="submitDelete"
          >
            Да, удалить
          </Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>

    <Dialog :open="isPaymentOpen" @update:open="(open) => (isPaymentOpen = open)">
      <DialogScrollContent :class="['flex flex-col gap-4', DIALOG_ANIMATE_CLASS]">
        <DialogHeader>
          <DialogTitle>Внести платёж</DialogTitle>
        </DialogHeader>
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-2">
            <Label>Сумма</Label>
            <Input v-model.number="paymentAmount" type="number" :class="NO_SPINNER_CLASS" @keydown="blockNonNumericKeys" />
          </div>
          <div class="flex flex-col gap-2">
            <Label>Дата</Label>
            <DatePickerField v-model="paymentDate" />
          </div>
          <div class="flex flex-col gap-2">
            <Label>Способ оплаты</Label>
            <Select :model-value="paymentMethod" @update:model-value="(v) => (paymentMethod = v as PaymentMethod)">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">Наличные</SelectItem>
                <SelectItem value="CARD_ACQUIRING">Эквайринг</SelectItem>
                <SelectItem value="BANK_TRANSFER">Банковский перевод</SelectItem>
                <SelectItem value="MAT_CAPITAL">Материнский капитал</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="flex flex-col gap-2">
            <Label>Комментарий</Label>
            <Input v-model="paymentComment" />
          </div>
          <p v-if="paymentError" class="text-sm text-red-500">{{ paymentError }}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="isPaymentOpen = false">Отмена</Button>
          <Button :loading="isSavingPayment" @click="submitPayment">Сохранить</Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>

    <Dialog :open="reversingPayment !== null" @update:open="(v) => { if (!v) reversingPayment = null }">
      <DialogScrollContent :class="['flex flex-col gap-4', DIALOG_ANIMATE_CLASS]">
        <DialogHeader>
          <DialogTitle>Сторнировать платёж?</DialogTitle>
          <DialogDescription>
            Платёж {{ reversingPayment ? formatMoney(reversingPayment.amount) : '' }} от
            {{ reversingPayment ? formatDate(reversingPayment.paidAt) : '' }} будет отмечен как сторнированный,
            начисления пересчитаются заново. Действие необратимо.
          </DialogDescription>
        </DialogHeader>
        <p v-if="reverseError" class="text-sm text-red-500">{{ reverseError }}</p>
        <DialogFooter>
          <Button variant="outline" @click="reversingPayment = null">Отмена</Button>
          <Button
            variant="outline"
            class="border-red-500 text-red-500 hover:text-red-500"
            :loading="isReversing"
            @click="confirmReversePayment"
          >
            Да, сторнировать
          </Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>
  </div>
</template>
