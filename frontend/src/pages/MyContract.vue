<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  CalendarClock,
  CalendarRange,
  Check,
  ChevronDown,
  Clock,
  CreditCard,
  DoorOpen,
  ExternalLink,
  FileX,
  Filter,
  History,
  Loader,
  Percent,
  Receipt,
  Wallet,
  X,
} from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import ContractStatusPill from '@/components/ContractStatusPill.vue'
import CreatePaymentDialog from '@/components/CreatePaymentDialog.vue'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { fetchMyContract, fetchMyContracts, type MyContractDetail, type MyContractSummary } from '@/lib/contracts-api'
import { getContractDisplayStatus, STATUS_LABELS as CONTRACT_STATUS_LABELS } from '@/lib/contracts-format'
import { fetchMyPayments, type PaymentIntentRow, type PaymentIntentStatus } from '@/lib/my-payments-api'
import { goBack } from '@/lib/utils'

const STATUS_LABELS: Record<PaymentIntentStatus, string> = {
  CREATED: 'Создан',
  PENDING_BANK: 'Обрабатывается банком',
  SUCCEEDED: 'Оплачено',
  FAILED: 'Не удалось',
  CANCELED: 'Отменено',
  EXPIRED: 'Истёк',
}
const STATUS_ICON = { CREATED: Clock, PENDING_BANK: Clock, SUCCEEDED: Check, FAILED: X, CANCELED: X, EXPIRED: X } as const
const STATUS_ICON_CLASS: Record<PaymentIntentStatus, string> = {
  CREATED: 'text-muted-foreground',
  PENDING_BANK: 'text-orange-500',
  SUCCEEDED: 'text-emerald-500',
  FAILED: 'text-red-500',
  CANCELED: 'text-muted-foreground',
  EXPIRED: 'text-muted-foreground',
}

// Та же граница вертикальных разделителей колонок, что и в общих таблицах приложения
// (EntityTable.vue/ContractDetail.vue) — для визуального единства.
const CELL_BORDER_CLASS = 'border-r border-border last:border-r-0'

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

// История платежей (вкладка "Платежи") — намеренно PaymentIntent (см. GET /my-payments),
// а не леджерные Payment из contract.payments: только тут есть статус конкретной
// попытки (в т.ч. "Не удалось") и ссылка на чек — перенесено сюда со страницы
// /student/payment по прямой просьбе 2026-08-25, страница сама скрыта из навигации.
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
function formatMoney(value: number): string {
  return `${value.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`
}

// --- Сортировка/фильтр таблиц "Начисления"/"Платежи" — тот же паттерн кнопки-заголовка
// (ArrowUp/ArrowDown/ArrowUpDown), что и в EntityTable.vue, но локально: обе таблицы —
// уже полностью загруженный в память массив своего резидента (не постранично с сервера,
// как в EntityTable), полноценный EntityTable под такой источник данных в проекте пока
// не заведён — по прямой просьбе 2026-08-25 добавлено сюда напрямую, без переиспользования
// серверной пагинации/фасетов EntityTable, которые тут просто не нужны.
type SortDir = 'asc' | 'desc'
type AccrualSortKey = 'periodStart' | 'balance'
const accrualSort = ref<{ key: AccrualSortKey; dir: SortDir } | null>(null)
function toggleAccrualSort(key: AccrualSortKey) {
  if (accrualSort.value?.key !== key) accrualSort.value = { key, dir: 'asc' }
  else if (accrualSort.value.dir === 'asc') accrualSort.value = { key, dir: 'desc' }
  else accrualSort.value = null
}
const sortedAccruals = computed(() => {
  const list = contract.value?.accruals ?? []
  if (!accrualSort.value) return list
  const { key, dir } = accrualSort.value
  const sign = dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    if (key === 'periodStart') return sign * a.periodStart.localeCompare(b.periodStart)
    return sign * (a.balance - b.balance)
  })
})

type PaymentSortKey = 'createdAt' | 'amount'
const paymentSort = ref<{ key: PaymentSortKey; dir: SortDir } | null>(null)
function togglePaymentSort(key: PaymentSortKey) {
  if (paymentSort.value?.key !== key) paymentSort.value = { key, dir: 'desc' }
  else if (paymentSort.value.dir === 'desc') paymentSort.value = { key, dir: 'asc' }
  else paymentSort.value = null
}
const paymentStatusFilter = ref<Set<PaymentIntentStatus>>(new Set())
const availablePaymentStatuses = computed(
  () => [...new Set(paymentHistory.value.map((p) => p.status))] as PaymentIntentStatus[],
)
function togglePaymentStatusFilter(status: PaymentIntentStatus, checked: boolean) {
  const next = new Set(paymentStatusFilter.value)
  if (checked) next.add(status)
  else next.delete(status)
  paymentStatusFilter.value = next
}
const filteredPaymentHistory = computed(() => {
  let list = paymentHistory.value
  if (paymentStatusFilter.value.size > 0) list = list.filter((p) => paymentStatusFilter.value.has(p.status))
  if (!paymentSort.value) return list
  const { key, dir } = paymentSort.value
  const sign = dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => (key === 'createdAt' ? sign * a.createdAt.localeCompare(b.createdAt) : sign * (a.amount - b.amount)))
})
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
      <CreatePaymentDialog ref="paymentDialog" />
      <span v-if="contract" class="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground">
        <History class="size-4 shrink-0 text-primary" />
        Создан {{ formatDate(contract.createdAt) }}
      </span>
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
          <!-- Кнопка "Оплатить" — тут, рядом с самой картой баланса/комнаты, а не в общем
               заголовке страницы (было тесно вперемешку с переключателем/статусом/датой
               создания, по прямой просьбе 2026-08-25 перенесена сюда). -->
          <Button size="sm" class="ml-auto flex items-center gap-2" @click="paymentDialog?.open(contract!.id)">
            <CreditCard class="size-4 shrink-0" />
            Оплатить
          </Button>
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
            <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/25">
              <DoorOpen class="size-5 text-amber-800 dark:text-amber-500" />
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
          <Card class="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden py-0">
            <div class="flex min-h-0 flex-1 flex-col">
              <Table>
                <TableHeader class="sticky top-0 z-10 bg-muted">
                  <TableRow>
                    <TableHead :class="CELL_BORDER_CLASS">
                      <button type="button" class="flex items-center gap-1.5 hover:text-foreground/80" @click="toggleAccrualSort('periodStart')">
                        Период
                        <ArrowUp v-if="accrualSort?.key === 'periodStart' && accrualSort.dir === 'asc'" class="size-3.5 shrink-0" />
                        <ArrowDown v-else-if="accrualSort?.key === 'periodStart'" class="size-3.5 shrink-0" />
                        <ArrowUpDown v-else class="size-3.5 shrink-0 text-muted-foreground/50" />
                      </button>
                    </TableHead>
                    <TableHead :class="CELL_BORDER_CLASS">Срок оплаты</TableHead>
                    <TableHead :class="CELL_BORDER_CLASS">Найм</TableHead>
                    <TableHead :class="CELL_BORDER_CLASS">Оплачено</TableHead>
                    <TableHead>
                      <button type="button" class="flex items-center gap-1.5 hover:text-foreground/80" @click="toggleAccrualSort('balance')">
                        Остаток
                        <ArrowUp v-if="accrualSort?.key === 'balance' && accrualSort.dir === 'asc'" class="size-3.5 shrink-0" />
                        <ArrowDown v-else-if="accrualSort?.key === 'balance'" class="size-3.5 shrink-0" />
                        <ArrowUpDown v-else class="size-3.5 shrink-0 text-muted-foreground/50" />
                      </button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="a in sortedAccruals" :key="a.id" :class="a.voidedAt ? 'opacity-40' : ''">
                    <TableCell :class="CELL_BORDER_CLASS">{{ formatDate(a.periodStart) }} — {{ formatDate(a.periodEnd) }}</TableCell>
                    <TableCell :class="CELL_BORDER_CLASS">{{ formatDate(a.dueDate) }}</TableCell>
                    <TableCell :class="CELL_BORDER_CLASS">{{ formatMoney(a.rentAmount) }}</TableCell>
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

        <TabsContent value="payments" class="flex min-h-0 flex-1 flex-col gap-2">
          <div v-if="paymentHistory.length" class="flex items-center justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="outline" size="sm" class="flex items-center gap-1.5">
                  <Filter class="size-3.5" />
                  Статус
                  <span v-if="paymentStatusFilter.size" class="text-primary">({{ paymentStatusFilter.size }})</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuCheckboxItem
                  v-for="status in availablePaymentStatuses"
                  :key="status"
                  :model-value="paymentStatusFilter.has(status)"
                  @update:model-value="(checked) => togglePaymentStatusFilter(status, !!checked)"
                >
                  {{ STATUS_LABELS[status] }}
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Card class="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden py-0">
            <p v-if="!paymentHistory.length" class="p-6 text-sm text-muted-foreground">Платежей пока нет</p>
            <p v-else-if="!filteredPaymentHistory.length" class="p-6 text-sm text-muted-foreground">Нет платежей с выбранным статусом</p>
            <div v-else class="flex min-h-0 flex-1 flex-col">
              <Table>
                <TableHeader class="sticky top-0 z-10 bg-muted">
                  <TableRow>
                    <TableHead :class="CELL_BORDER_CLASS">
                      <button type="button" class="flex items-center gap-1.5 hover:text-foreground/80" @click="togglePaymentSort('createdAt')">
                        Дата
                        <ArrowUp v-if="paymentSort?.key === 'createdAt' && paymentSort.dir === 'asc'" class="size-3.5 shrink-0" />
                        <ArrowDown v-else-if="paymentSort?.key === 'createdAt'" class="size-3.5 shrink-0" />
                        <ArrowUpDown v-else class="size-3.5 shrink-0 text-muted-foreground/50" />
                      </button>
                    </TableHead>
                    <TableHead :class="CELL_BORDER_CLASS">Описание</TableHead>
                    <TableHead :class="CELL_BORDER_CLASS">
                      <button type="button" class="flex items-center gap-1.5 hover:text-foreground/80" @click="togglePaymentSort('amount')">
                        Сумма
                        <ArrowUp v-if="paymentSort?.key === 'amount' && paymentSort.dir === 'asc'" class="size-3.5 shrink-0" />
                        <ArrowDown v-else-if="paymentSort?.key === 'amount'" class="size-3.5 shrink-0" />
                        <ArrowUpDown v-else class="size-3.5 shrink-0 text-muted-foreground/50" />
                      </button>
                    </TableHead>
                    <TableHead :class="CELL_BORDER_CLASS">Статус</TableHead>
                    <TableHead>Чек</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="row in filteredPaymentHistory" :key="row.id">
                    <TableCell :class="CELL_BORDER_CLASS">{{ formatDate(row.createdAt) }}</TableCell>
                    <TableCell :class="CELL_BORDER_CLASS">{{ row.description }}</TableCell>
                    <TableCell :class="CELL_BORDER_CLASS">{{ formatMoney(row.amount) }}</TableCell>
                    <TableCell :class="CELL_BORDER_CLASS">
                      <span class="flex items-center gap-1.5">
                        <component :is="STATUS_ICON[row.status]" class="size-3.5" :class="STATUS_ICON_CLASS[row.status]" />
                        {{ STATUS_LABELS[row.status] }}
                      </span>
                    </TableCell>
                    <TableCell>
                      <a
                        v-if="row.fiscalReceiptUrl"
                        :href="row.fiscalReceiptUrl"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="flex items-center gap-1 text-primary hover:underline"
                      >
                        Открыть
                        <ExternalLink class="size-3.5" />
                      </a>
                      <!-- Заглушка: реального чека ещё нет (касса не подключена), но кнопка
                           уже на месте — по прямой просьбе 2026-08-25 (реальный PDF отдаст
                           сам ОФД/platformaofd.ru после подключения, свой макет не делаем). -->
                      <button
                        v-else-if="row.status === 'SUCCEEDED'"
                        type="button"
                        class="flex items-center gap-1 text-primary hover:underline"
                        title="Заглушка — после подключения кассы здесь будет ссылка на чек от ОФД"
                      >
                        Открыть
                        <ExternalLink class="size-3.5" />
                      </button>
                      <span v-else class="text-muted-foreground">—</span>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </template>
  </div>
</template>
