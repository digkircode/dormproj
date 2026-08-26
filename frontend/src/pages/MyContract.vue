<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowLeft,
  CalendarClock,
  CalendarRange,
  ChevronDown,
  CreditCard,
  DoorOpen,
  FileX,
  History,
  Loader,
  Percent,
  Receipt,
  Wallet,
} from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import ContractStatusPill from '@/components/ContractStatusPill.vue'
import CreatePaymentDialog from '@/components/CreatePaymentDialog.vue'
import EntityTable from '@/components/EntityTable.vue'
import AccrualBalanceCell from '@/components/AccrualBalanceCell.vue'
import PaymentStatusPillCell from '@/components/PaymentStatusPillCell.vue'
import PaymentReceiptCell from '@/components/PaymentReceiptCell.vue'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { createAppColumnHelper } from '@/lib/table'
import { createClientFetchPage, createClientFacetValues } from '@/lib/client-list'
import { fetchMyContract, fetchMyContracts, type AccrualRow, type MyContractDetail, type MyContractSummary } from '@/lib/contracts-api'
import { getContractDisplayStatus, STATUS_LABELS as CONTRACT_STATUS_LABELS } from '@/lib/contracts-format'
import {
  fetchMyPayments,
  UNIFIED_PAYMENT_STATUS_LABELS,
  type PaymentIntentRow,
  type UnifiedPaymentRow,
  type UnifiedPaymentStatus,
} from '@/lib/my-payments-api'
import { goBack } from '@/lib/utils'

// Та же карта, что и в ContractDetail.vue (сотруднический "Внести платёж") — не вынесена
// в общий модуль там по той же причине, что и остальные небольшие повторы в проекте
// (см. промпт), тут тот же принцип.
const METHOD_LABELS: Record<string, string> = {
  CASH: 'Наличные',
  CARD_ACQUIRING: 'Эквайринг',
  BANK_TRANSFER: 'Банковский перевод',
  MAT_CAPITAL: 'Материнский капитал',
  WEBSITE: 'Сайт',
}

const router = useRouter()
const contract = ref<MyContractDetail | null>(null)
// Загрузка успешно завершилась, но договора нет — отдельно от isLoading/loadError, чтобы
// не путать "договора действительно нет" с "ещё грузится"/"ошибка запроса" (тот же приём,
// что messagesLoadedFor в Chats.vue).
const isLoading = ref(true)
const loadError = ref('')

// У одного человека может быть больше одного договора одновременно (новый не ждёт
// окончания предыдущего, см. schema.prisma) — переключатель по клику на "Договор № …"
// (по прямой просьбе 2026-08-25). Без выбора — самый свежий, как и раньше.
const contracts = ref<MyContractSummary[]>([])
const selectedContractId = ref<number | undefined>(undefined)

// Попытки онлайн-оплаты (GET /my-payments) — сырые, дальше объединяются с леджерными
// contract.payments в unifiedPayments (см. ниже).
const paymentHistory = ref<PaymentIntentRow[]>([])

// silent — переключение УЖЕ выбранного на странице договора (см. switchContract): не
// прячем текущие данные под "Загрузка…" (было резко и дёргано, по прямой просьбе
// 2026-08-25), просто приглушаем карточку/вкладки полупрозрачностью, пока не придут новые.
const isSwitching = ref(false)

async function load(silent = false) {
  if (silent) isSwitching.value = true
  else isLoading.value = true
  loadError.value = ''
  try {
    contract.value = await fetchMyContract(selectedContractId.value)
    if (!selectedContractId.value && contract.value) selectedContractId.value = contract.value.id
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isLoading.value = false
    isSwitching.value = false
  }
  try {
    const payments = await fetchMyPayments(selectedContractId.value)
    paymentHistory.value = payments.history
  } catch {
    // Тихо игнорируем — основная карточка договора важнее, вкладка "Платежи" просто
    // останется пустой при ошибке (тот же принцип, что и остальные вспомогательные секции).
  }
}

async function switchContract(id: number) {
  // Клик по уже показанному договору в списке — не перезагружать (по прямой просьбе
  // 2026-08-25), тот же принцип, что и не дёргать сеть без реальной смены выбора.
  if (id === selectedContractId.value) return
  selectedContractId.value = id
  await load(true)
}

onMounted(async () => {
  // Список договоров грузим ПАРАЛЛЕЛЬНО с самим договором, а не после (было — стрелочка
  // переключателя "запаздывала": сначала рисовался обычный заголовок, потом резко
  // подменялся на выпадающий список, когда список догружался). К моменту, когда основной
  // load() разрешится (там два последовательных запроса), этот — уже почти наверняка готов.
  const contractsPromise = fetchMyContracts().catch(() => [])
  await load()
  contracts.value = await contractsPromise
})

const paymentDialog = ref<InstanceType<typeof CreatePaymentDialog> | null>(null)

// История начисления пени по дням — раскрывается кликом по тайлу "Пени" (по прямой
// просьбе 2026-08-26). Данные уже приходят вместе с договором (contract.penaltyLog,
// см. my-contract.controller.ts), отдельного запроса не требуется.
const isPenaltyDialogOpen = ref(false)
const PENALTY_DAILY_RATE_PERCENT = '0,14%'

const totalBalance = computed(() =>
  contract.value ? contract.value.accruals.reduce((sum, a) => sum + a.balance, 0) + contract.value.penaltyBalance : 0,
)
// Тот же вычисляемый бакет "Истекает", что в ContractDetail.vue/списке договоров — см.
// contracts-format.ts, держать в актуальном состоянии вместе с остальными местами.
const displayStatus = computed(() => (contract.value ? getContractDisplayStatus(contract.value.status, contract.value.endDate) : null))
const rentAmount = computed(() => contract.value?.terms[0]?.rentAmount ?? 0)
const isDailyOnlyContract = computed(
  () => (contract.value?.terms[0]?.rentAmount ?? 0) === 0 && (contract.value?.terms[0]?.utilitiesAmount ?? 0) === 0,
)

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('ru-RU')
}
function monthLabel(value: string): string {
  return new Date(value).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
}
function formatMoney(value: number): string {
  return `${value.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`
}

// --- Начисления — та же EntityTable, что и во всех остальных таблицах приложения (по
// прямой просьбе 2026-08-26 — раньше тут были самодельные кнопки-заголовки без настроек
// колонок/поиска). fetchPage/fetchFacetValues — клиентский адаптер (см. lib/client-list.ts):
// начисления уже целиком в памяти (не постранично с сервера, как у остальных таблиц). ---
const accrualColumnHelper = createAppColumnHelper<AccrualRow>()
const accrualColumnLabels: Record<string, string> = {
  periodStart: 'Период',
  dueDate: 'Срок оплаты',
  rentAmount: 'Найм',
  paid: 'Оплачено',
  balance: 'Остаток',
}
const accrualColumns = accrualColumnHelper.columns([
  accrualColumnHelper.accessor('periodStart', { header: accrualColumnLabels.periodStart, size: 160, minSize: 130 }),
  accrualColumnHelper.accessor('dueDate', { header: accrualColumnLabels.dueDate, enableSorting: false, size: 140, minSize: 110 }),
  accrualColumnHelper.accessor('rentAmount', { header: accrualColumnLabels.rentAmount, enableSorting: false, size: 120, minSize: 100 }),
  accrualColumnHelper.accessor('paid', { header: accrualColumnLabels.paid, enableSorting: false, size: 120, minSize: 100 }),
  accrualColumnHelper.accessor('balance', { header: accrualColumnLabels.balance, size: 120, minSize: 100 }),
])
function accrualCellText(columnId: string, value: unknown): string {
  if (columnId === 'periodStart' && typeof value === 'string') return monthLabel(value)
  if (columnId === 'dueDate' && typeof value === 'string') return formatDate(value)
  if ((columnId === 'rentAmount' || columnId === 'paid') && typeof value === 'number') return formatMoney(value)
  return String(value ?? '')
}
const accrualCellRenderers = { balance: AccrualBalanceCell }
const fetchAccrualsPage = createClientFetchPage(() => contract.value?.accruals ?? [], {
  searchText: (a) => `${monthLabel(a.periodStart)} ${formatDate(a.dueDate)}`,
  sortValue: (a, sortBy) => (a as unknown as Record<string, string | number>)[sortBy],
})
async function fetchAccrualFacets() {
  return []
}

// --- Платежи — объединённый леджер (Payment, в т.ч. внесённые сотрудником вручную и уже
// успешно проведённые онлайн) + попытки, которые деньгами не закончились (см. тип
// UnifiedPaymentRow) — по прямой просьбе 2026-08-26: раньше вкладка видела только
// PaymentIntent и не показывала оплаты, внесённые сотрудником. ---
const unifiedPayments = computed<UnifiedPaymentRow[]>(() => {
  const ledgerRows: UnifiedPaymentRow[] = (contract.value?.payments ?? []).map((p) => ({
    id: `payment-${p.id}`,
    date: p.paidAt,
    description: p.rawComment || METHOD_LABELS[p.method] || p.method,
    amount: p.amount,
    status: p.reversedAt ? 'REVERSED' : 'PAID',
    // Заглушка чека — только для того, что реально прошло как онлайн-оплата (эквайринг/
    // сайт); у ручных наличных/переводом сотрудник чек не выписывает, показывать кнопку
    // там было бы вводящей в заблуждение.
    showReceiptButton: !p.reversedAt && (p.method === 'CARD_ACQUIRING' || p.method === 'WEBSITE'),
    fiscalReceiptUrl: null,
  }))
  const intentRows: UnifiedPaymentRow[] = paymentHistory.value
    .filter((row): row is PaymentIntentRow & { status: Exclude<PaymentIntentRow['status'], 'SUCCEEDED'> } => row.status !== 'SUCCEEDED')
    .map((row) => ({
      id: `intent-${row.id}`,
      date: row.createdAt,
      description: row.description,
      amount: row.amount,
      status: row.status,
      showReceiptButton: false,
      fiscalReceiptUrl: row.fiscalReceiptUrl,
    }))
  return [...ledgerRows, ...intentRows]
})

const paymentColumnHelper = createAppColumnHelper<UnifiedPaymentRow>()
const paymentColumnLabels: Record<string, string> = {
  date: 'Дата',
  description: 'Описание',
  amount: 'Сумма',
  status: 'Статус',
  fiscalReceiptUrl: 'Чек',
}
const paymentColumns = paymentColumnHelper.columns([
  paymentColumnHelper.accessor('date', { header: paymentColumnLabels.date, size: 140, minSize: 110 }),
  paymentColumnHelper.accessor('description', { header: paymentColumnLabels.description, enableSorting: false, size: 260, minSize: 160 }),
  paymentColumnHelper.accessor('amount', { header: paymentColumnLabels.amount, size: 120, minSize: 100 }),
  paymentColumnHelper.accessor('status', { header: paymentColumnLabels.status, enableSorting: false, size: 170, minSize: 150 }),
  paymentColumnHelper.accessor('fiscalReceiptUrl', { header: paymentColumnLabels.fiscalReceiptUrl, enableSorting: false, enableHiding: false, size: 120, minSize: 100 }),
])
function paymentCellText(columnId: string, value: unknown): string {
  if (columnId === 'date' && typeof value === 'string') return formatDate(value)
  if (columnId === 'amount' && typeof value === 'number') return formatMoney(value)
  return String(value ?? '')
}
const paymentCellRenderers = { status: PaymentStatusPillCell, fiscalReceiptUrl: PaymentReceiptCell }
const paymentFilterableFields = ['status']
const fetchPaymentsPage = createClientFetchPage(() => unifiedPayments.value, {
  searchText: (row) => row.description,
  sortValue: (row, sortBy) => (row as unknown as Record<string, string | number>)[sortBy],
  filterValue: (row, field) => (field === 'status' ? row.status : ''),
})
const fetchPaymentFacets = createClientFacetValues<UnifiedPaymentRow>(
  () => unifiedPayments.value,
  (row, field) => (field === 'status' ? row.status : ''),
  (field, value) => (field === 'status' ? UNIFIED_PAYMENT_STATUS_LABELS[value as UnifiedPaymentStatus] : value),
)
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/')">
        <ArrowLeft class="text-primary" />
        <span class="sr-only">Назад</span>
      </Button>
      <!-- Явно кнопочный вид (рамка/фон), не просто текст+стрелка — чтобы возможность
           сменить договор считывалась сразу, а не терялась среди заголовка (по прямой
           просьбе 2026-08-25). Виден только когда договоров реально больше одного. -->
      <DropdownMenu v-if="contract && contracts.length > 1">
        <DropdownMenuTrigger as-child>
          <button
            type="button"
            class="flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-lg font-medium hover:bg-accent"
          >
            Договор № {{ contract.number }}
            <ChevronDown class="size-4 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem v-for="c in contracts" :key="c.id" :class="c.id === selectedContractId ? 'font-medium' : ''" @click="switchContract(c.id)">
            № {{ c.number }} — {{ CONTRACT_STATUS_LABELS[getContractDisplayStatus(c.status, c.endDate)] }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <h1 v-else class="text-lg font-medium">{{ contract ? `Договор № ${contract.number}` : 'Договор/Платежи' }}</h1>
      <ContractStatusPill v-if="displayStatus" :status="displayStatus" />
      <Loader v-if="isSwitching" class="size-4 shrink-0 animate-spin text-muted-foreground" />
      <!-- Тут же, на уровне номера договора — было тесно вперемешку с датой создания,
           та переехала в карточку ниже (по прямой просьбе 2026-08-26). -->
      <Button v-if="contract" size="sm" class="ml-auto flex items-center gap-2" @click="paymentDialog?.open(contract.id)">
        <CreditCard class="size-4 shrink-0" />
        Оплатить
      </Button>
      <CreatePaymentDialog ref="paymentDialog" />
    </div>

    <p v-if="loadError" class="text-sm text-red-500">{{ loadError }}</p>
    <p v-if="isLoading" class="text-sm text-muted-foreground">Загрузка…</p>

    <Card v-if="!isLoading && !loadError && !contract" class="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <FileX class="size-8 text-muted-foreground" />
      <p class="text-sm font-medium">Действующего договора не найдено</p>
      <p class="max-w-sm text-sm text-muted-foreground">
        Как только с вами будет заключён договор найма, информация о нём появится на этой странице.
      </p>
    </Card>

    <template v-if="contract">
      <!-- opacity/transition — та же смена договора, что и переключатель выше, но резче
           бросается в глаза именно тут (весь блок цифр), поэтому приглушаем отдельно. -->
      <div class="flex min-h-0 flex-1 flex-col gap-4 transition-opacity duration-200" :class="isSwitching ? 'opacity-50' : ''">
      <Card class="flex flex-col gap-4 p-4">
        <div class="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span v-if="contract.currentRoom" class="flex items-center gap-1.5">
            <DoorOpen class="size-4 shrink-0 text-primary" />
            Комната {{ contract.currentRoom.room }}
          </span>
          <span class="flex items-center gap-1.5">
            <CalendarRange class="size-4 shrink-0 text-primary" />
            {{ formatDate(contract.startDate) }} — {{ formatDate(contract.actualEndDate ?? contract.endDate) }}
          </span>
          <!-- Дата создания — тут же, в карточке (была в общем заголовке страницы, но там
               теперь кнопка "Оплатить", по прямой просьбе 2026-08-26). -->
          <span class="ml-auto flex items-center gap-1.5 text-muted-foreground">
            <History class="size-4 shrink-0 text-primary" />
            Создан {{ formatDate(contract.createdAt) }}
          </span>
        </div>

        <div class="grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-4">
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
            <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-500/15">
              <CalendarClock class="size-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p class="text-xs text-muted-foreground">Суточная ставка</p>
              <p class="text-lg font-medium">{{ formatMoney(contract.terms[0]?.dailyRateAmount ?? 0) }}</p>
            </div>
          </div>
          <!-- Кликабельно — открывает историю начисления по дням (см. isPenaltyDialogOpen),
               по прямой просьбе 2026-08-26: раньше сумма пени не объяснялась ничем. -->
          <button
            type="button"
            class="-m-1 flex items-center gap-3 rounded-lg p-1 text-left transition-colors hover:bg-accent"
            @click="isPenaltyDialogOpen = true"
          >
            <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-500/15">
              <Percent class="size-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p class="text-xs text-muted-foreground">Пени</p>
              <p class="text-lg font-medium" :class="contract.penaltyBalance > 0 ? 'text-red-500' : ''">
                {{ formatMoney(contract.penaltyBalance) }}
              </p>
            </div>
          </button>
        </div>
      </Card>

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
          <EntityTable
            :key="`accruals-${contract.id}`"
            :columns="accrualColumns"
            :column-labels="accrualColumnLabels"
            :filterable-fields="[]"
            :default-sort="{ id: 'periodStart', desc: false }"
            :fetch-page="fetchAccrualsPage"
            :fetch-facet-values="fetchAccrualFacets"
            :get-row-id="(a: AccrualRow) => String(a.id)"
            total-label="начислений"
            :cell-text="accrualCellText"
            :cell-renderers="accrualCellRenderers"
            storage-key="my-contract-accruals"
            accent-icons
            hide-search
          />
        </TabsContent>

        <TabsContent value="payments" class="flex min-h-0 flex-1 flex-col">
          <EntityTable
            :key="`payments-${contract.id}`"
            :columns="paymentColumns"
            :column-labels="paymentColumnLabels"
            :filterable-fields="paymentFilterableFields"
            :default-sort="{ id: 'date', desc: true }"
            :fetch-page="fetchPaymentsPage"
            :fetch-facet-values="fetchPaymentFacets"
            :get-row-id="(r: UnifiedPaymentRow) => r.id"
            total-label="платежей"
            :cell-text="paymentCellText"
            :cell-renderers="paymentCellRenderers"
            storage-key="my-contract-payments"
            accent-icons
            hide-search
          />
        </TabsContent>
      </Tabs>
      </div>
    </template>

    <Dialog :open="isPenaltyDialogOpen" @update:open="(open) => (isPenaltyDialogOpen = open)">
      <DialogScrollContent class="flex max-h-[85vh] flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-1.5">
            <Percent class="size-4 text-orange-500" />
            История начисления пени
          </DialogTitle>
          <DialogDescription>
            0,14% в день от суммы просроченных непогашенных начислений — начисляется с 10 числа месяца, следующего за
            неоплаченным периодом.
          </DialogDescription>
        </DialogHeader>
        <div v-if="contract?.penaltyLog.length" class="-mx-1 flex-1 space-y-1 overflow-y-auto px-1" style="max-height: 50vh">
          <div
            v-for="row in contract.penaltyLog"
            :key="row.date"
            class="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm"
          >
            <div>
              <p class="font-medium">{{ formatDate(row.date) }}</p>
              <p class="text-xs text-muted-foreground">{{ PENALTY_DAILY_RATE_PERCENT }} от {{ formatMoney(row.overdueBase) }}</p>
            </div>
            <span class="font-medium text-orange-600 dark:text-orange-400">+{{ formatMoney(row.amount) }}</span>
          </div>
        </div>
        <p v-else class="text-sm text-muted-foreground">Пеня ни разу не начислялась.</p>
      </DialogScrollContent>
    </Dialog>
  </div>
</template>
