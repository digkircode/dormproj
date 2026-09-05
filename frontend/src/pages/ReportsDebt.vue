<script setup lang="ts">
import { computed, onMounted, provide, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { AlertTriangle, ArrowLeft, Banknote, Download, Info, Percent, Users, Wallet } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell, TableFooter } from '@/components/ui/table'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import EntityTable from '@/components/EntityTable.vue'
import ContractLinkCell from '@/components/ContractLinkCell.vue'
import ResidentLinkCell from '@/components/ResidentLinkCell.vue'
import DebtBalanceCell from '@/components/DebtBalanceCell.vue'
import PenaltyBalanceCell from '@/components/PenaltyBalanceCell.vue'
import ContractStatusCell from '@/components/ContractStatusCell.vue'
import ReportKpiTile from '@/components/ReportKpiTile.vue'
import DatePickerField from '@/components/DatePickerField.vue'
import { createAppColumnHelper } from '@/lib/table'
import {
  fetchDebtorsPage,
  fetchDebtorsFacets,
  fetchDebtorsSummary,
  fetchDebtorBreakdown,
  fetchDebtorPenaltyLog,
  exportDebtorsExcel,
  type DebtorRow,
  type DebtorsSummary,
  type DebtorBreakdown,
  type DebtorPenaltyLog,
  type ListOptions,
} from '@/lib/reports-api'
import { goBack } from '@/lib/utils'
import { dateLocaleTag, todayIso } from '@/lib/format-locale'

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
// Вертикальные разделители колонок — тот же приём, что и в остальных таблицах
// приложения (EntityTable.vue/ContractDetail.vue), для визуального единства.
const CELL_BORDER_CLASS = 'border-r border-border last:border-r-0'

const router = useRouter()
const { t } = useI18n()

// computed, не const — header-текст берётся из t() (i18n), таблица (useTable в
// EntityTable.vue) watch'ит props.columns реактивно и пересобирает заголовки при смене
// языка, но только если columns — новая reactive-ссылка (см. тот же приём в Contracts.vue).
const columnLabels = computed<Record<string, string>>(() => ({
  contractNumber: t('reports.debt.colContractNumber'),
  residentFullName: t('reports.debt.colResident'),
  room: t('reports.debt.colRoom'),
  status: t('reports.debt.colStatus'),
  createdAt: t('reports.debt.colCreatedAt'),
  totalAccrued: t('reports.debt.colAccrued'),
  totalPaid: t('reports.debt.colPaid'),
  penaltyBalance: t('reports.debt.colPenalty'),
  totalBalance: t('reports.debt.colDebt'),
  // Псевдо-поля под фильтр — не настоящие колонки таблицы (см. reports.controller.ts,
  // withDisplayStatus), по прямой просьбе 2026-08-27: "Только должники"/"Есть пеня".
  hasDebt: t('reports.debt.filterHasDebt'),
  hasPenalty: t('reports.debt.filterHasPenalty'),
}))
const filterableFields = ['status', 'hasDebt', 'hasPenalty']
const cellRenderers = {
  contractNumber: ContractLinkCell,
  residentFullName: ResidentLinkCell,
  status: ContractStatusCell,
  penaltyBalance: PenaltyBalanceCell,
  totalBalance: DebtBalanceCell,
}

function formatMoney(value: number): string {
  return `${value.toLocaleString(dateLocaleTag(), { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`
}
function formatDateIso(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
}
function cellText(columnId: string, value: unknown): string {
  if (
    (columnId === 'totalAccrued' || columnId === 'totalPaid' || columnId === 'penaltyBalance' || columnId === 'totalBalance') &&
    typeof value === 'number'
  ) {
    return formatMoney(value)
  }
  if (columnId === 'createdAt' && typeof value === 'string') {
    return formatDateIso(value)
  }
  return String(value ?? '')
}

const columnHelper = createAppColumnHelper<DebtorRow>()
const columns = computed(() =>
  columnHelper.columns([
    columnHelper.accessor('contractNumber', { header: columnLabels.value.contractNumber, enableHiding: false, size: 128, minSize: 100 }),
    columnHelper.accessor('residentFullName', { header: columnLabels.value.residentFullName, size: 200, minSize: 160 }),
    columnHelper.accessor('room', { header: columnLabels.value.room, size: 100, minSize: 90 }),
    columnHelper.accessor('status', { header: columnLabels.value.status, size: 130, minSize: 110 }),
    columnHelper.accessor('createdAt', { header: columnLabels.value.createdAt, size: 130, minSize: 110 }),
    columnHelper.accessor('totalAccrued', { header: columnLabels.value.totalAccrued, size: 130, minSize: 110 }),
    columnHelper.accessor('totalPaid', { header: columnLabels.value.totalPaid, size: 130, minSize: 110 }),
    columnHelper.accessor('penaltyBalance', { header: columnLabels.value.penaltyBalance, size: 110, minSize: 90 }),
    columnHelper.accessor('totalBalance', { header: columnLabels.value.totalBalance, size: 130, minSize: 110 }),
  ]),
)

// Отчёт "на дату" (по умолчанию сегодня) — тот же приём, что период в ReportsMovements.vue:
// EntityTable сама не знает про внешний asOf, перезапрашиваем страницу и сводку вручную
// через её exposed refresh() при смене даты.
const asOf = ref(todayIso())

function fetchPage(options: ListOptions, signal?: AbortSignal) {
  return fetchDebtorsPage(options, asOf.value, signal)
}

const summary = ref<DebtorsSummary | null>(null)
async function loadSummary() {
  if (!asOf.value) return
  summary.value = await fetchDebtorsSummary(asOf.value)
}

const entityTable = ref<{ refresh: () => void } | null>(null)
watch(asOf, () => {
  loadSummary()
  entityTable.value?.refresh()
})
onMounted(loadSummary)

// "Месяц" — крупно название месяца, мелко и в скобках короткий диапазон дат под ним
// (неполные месяцы на границах договора всё равно остаются понятны по датам).
function monthLabel(iso: string): string {
  const label = new Date(iso).toLocaleDateString(dateLocaleTag(), { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}
function formatDateShort(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`
}

// --- Структура долга по месяцам — открывается отдельной кнопкой-инфо в конце строки ---
const breakdownOpen = ref(false)
const breakdown = ref<DebtorBreakdown | null>(null)
const breakdownLoading = ref(false)
const breakdownError = ref('')

async function openBreakdown(contractId: number) {
  breakdownOpen.value = true
  breakdown.value = null
  breakdownError.value = ''
  breakdownLoading.value = true
  try {
    breakdown.value = await fetchDebtorBreakdown(contractId, asOf.value)
  } catch (error) {
    breakdownError.value = error instanceof Error ? error.message : String(error)
  } finally {
    breakdownLoading.value = false
  }
}

// --- Расшифровка пени по дням — клик по значению "Пеня" в таблице ---
const penaltyLogOpen = ref(false)
const penaltyLog = ref<DebtorPenaltyLog | null>(null)
const penaltyLogLoading = ref(false)
const penaltyLogError = ref('')

async function openPenaltyLog(contractId: number) {
  penaltyLogOpen.value = true
  penaltyLog.value = null
  penaltyLogError.value = ''
  penaltyLogLoading.value = true
  try {
    penaltyLog.value = await fetchDebtorPenaltyLog(contractId, asOf.value)
  } catch (error) {
    penaltyLogError.value = error instanceof Error ? error.message : String(error)
  } finally {
    penaltyLogLoading.value = false
  }
}
provide('openPenaltyLog', openPenaltyLog)

// --- Экспорт в Excel — учитывает только "на дату" (тот же asOf, что и у самого отчёта),
// поиск/фильтры/сортировку колонок EntityTable не пробрасывает наружу (см. downloadFile).
const isExporting = ref(false)
const exportError = ref('')
async function onExport() {
  exportError.value = ''
  isExporting.value = true
  try {
    await exportDebtorsExcel(asOf.value)
  } catch (error) {
    exportError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isExporting.value = false
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/')">
        <ArrowLeft class="text-primary" />
        <span class="sr-only">{{ t('reports.common.back') }}</span>
      </Button>
      <h1 class="text-lg font-medium">{{ t('reports.debt.title') }}</h1>
    </div>

    <Card v-if="summary" class="grid grid-cols-5 gap-4 p-4">
      <ReportKpiTile
        :icon="Users"
        bg-class="bg-blue-100 dark:bg-blue-500/15"
        icon-class="text-blue-600 dark:text-blue-400"
        :label="t('reports.debt.kpiDebtors')"
        :value="String(summary.debtorsCount)"
      />
      <ReportKpiTile
        :icon="Banknote"
        bg-class="bg-violet-100 dark:bg-violet-500/15"
        icon-class="text-violet-600 dark:text-violet-400"
        :label="t('reports.debt.kpiAccrued')"
        :value="formatMoney(summary.totalAccrued)"
      />
      <ReportKpiTile
        :icon="AlertTriangle"
        bg-class="bg-red-100 dark:bg-red-500/15"
        icon-class="text-red-600 dark:text-red-400"
        :label="t('reports.debt.kpiDebt')"
        :value="formatMoney(summary.totalDebt)"
      />
      <ReportKpiTile
        :icon="Percent"
        bg-class="bg-orange-100 dark:bg-orange-500/15"
        icon-class="text-orange-600 dark:text-orange-400"
        :label="t('reports.debt.kpiPenalty')"
        :value="formatMoney(summary.totalPenalty)"
      />
      <ReportKpiTile
        :icon="Wallet"
        bg-class="bg-emerald-100 dark:bg-emerald-500/15"
        icon-class="text-emerald-600 dark:text-emerald-400"
        :label="t('reports.debt.kpiPaid')"
        :value="formatMoney(summary.totalPaid)"
      />
    </Card>

    <EntityTable
      ref="entityTable"
      :columns="columns"
      :column-labels="columnLabels"
      :filterable-fields="filterableFields"
      :default-sort="{ id: 'totalBalance', desc: true }"
      :fetch-page="fetchPage"
      :fetch-facet-values="fetchDebtorsFacets"
      :get-row-id="(d: DebtorRow) => String(d.contractId)"
      :total-label="t('reports.common.totalContracts')"
      :cell-text="cellText"
      :cell-renderers="cellRenderers"
      storage-key="reports-debt"
      accent-icons
      :row-action="{ icon: Info, label: t('reports.debt.breakdownAction'), onClick: (d: DebtorRow) => openBreakdown(d.contractId) }"
    >
      <template #actions>
        <span class="text-sm text-muted-foreground">{{ t('reports.common.asOf') }}</span>
        <DatePickerField v-model="asOf" />
        <Tooltip>
          <TooltipTrigger as-child>
            <Button size="icon" :loading="isExporting" @click="onExport">
              <Download />
              <span class="sr-only">{{ t('reports.common.exportExcel') }}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{{ t('reports.common.exportExcel') }}</TooltipContent>
        </Tooltip>
      </template>
    </EntityTable>
    <p v-if="exportError" class="text-sm text-red-500">{{ exportError }}</p>

    <Dialog :open="breakdownOpen" @update:open="(open) => (breakdownOpen = open)">
      <DialogScrollContent :class="['flex flex-col gap-4 sm:max-w-3xl', DIALOG_ANIMATE_CLASS]">
        <DialogHeader>
          <DialogTitle>
            {{
              breakdown
                ? t('reports.debt.breakdownTitle', { name: breakdown.residentFullName, room: breakdown.room ?? '—' })
                : t('reports.debt.breakdownTitleFallback')
            }}
          </DialogTitle>
        </DialogHeader>

        <p v-if="breakdownError" class="text-sm text-red-500">{{ breakdownError }}</p>
        <p v-if="breakdownLoading" class="text-sm text-muted-foreground">{{ t('entityTable.loading') }}</p>

        <div v-if="breakdown" class="flex flex-col gap-3">
          <div class="overflow-hidden rounded-md border">
            <Table>
              <TableHeader class="bg-muted">
                <TableRow>
                  <TableHead :class="CELL_BORDER_CLASS">{{ t('reports.debt.colMonth') }}</TableHead>
                  <TableHead :class="CELL_BORDER_CLASS">{{ t('reports.debt.colAccrued') }}</TableHead>
                  <TableHead :class="CELL_BORDER_CLASS">{{ t('reports.debt.colPaid') }}</TableHead>
                  <TableHead>{{ t('reports.debt.colDebt') }}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-if="!breakdown.periods.length">
                  <TableCell colspan="4" class="text-center text-muted-foreground">{{ t('reports.debt.noAccruals') }}</TableCell>
                </TableRow>
                <TableRow v-for="p in breakdown.periods" :key="p.id">
                  <TableCell :class="[CELL_BORDER_CLASS, p.voidedAt ? 'text-muted-foreground line-through' : '']">
                    <div class="flex flex-col">
                      <span>{{ monthLabel(p.periodStart) }}</span>
                      <span class="text-xs text-muted-foreground">({{ formatDateShort(p.periodStart) }}–{{ formatDateShort(p.periodEnd) }})</span>
                    </div>
                  </TableCell>
                  <TableCell :class="CELL_BORDER_CLASS">{{ formatMoney(p.total) }}</TableCell>
                  <TableCell :class="CELL_BORDER_CLASS">{{ formatMoney(p.paid) }}</TableCell>
                  <TableCell :class="p.balance > 0 ? 'text-red-500' : p.balance < 0 ? 'text-emerald-600 dark:text-emerald-400' : ''">
                    {{ formatMoney(p.balance) }}
                  </TableCell>
                </TableRow>
              </TableBody>
              <TableFooter v-if="breakdown.periods.length">
                <TableRow>
                  <TableCell :class="CELL_BORDER_CLASS">{{ t('reports.common.total') }}</TableCell>
                  <TableCell :class="CELL_BORDER_CLASS">{{ formatMoney(breakdown.totalAccrued) }}</TableCell>
                  <TableCell :class="CELL_BORDER_CLASS">{{ formatMoney(breakdown.totalPaid) }}</TableCell>
                  <TableCell
                    :class="
                      breakdown.totalDebt - breakdown.penaltyBalance > 0
                        ? 'text-red-500'
                        : breakdown.totalDebt - breakdown.penaltyBalance < 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : ''
                    "
                  >
                    {{ formatMoney(breakdown.totalDebt - breakdown.penaltyBalance) }}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
          <!-- Пеня — единая на договор, не по месяцам (см. reports.controller.ts), поэтому
               отдельной строкой итога, а не колонкой в помесячной разбивке. -->
          <div class="flex flex-col items-end gap-1 text-sm">
            <p v-if="breakdown.penaltyBalance > 0" class="text-red-500">
              {{ t('reports.debt.penaltyByContract', { amount: formatMoney(breakdown.penaltyBalance) }) }}
            </p>
            <p class="font-medium">{{ t('reports.debt.totalDebtLine', { amount: formatMoney(breakdown.totalDebt) }) }}</p>
          </div>
        </div>
      </DialogScrollContent>
    </Dialog>

    <Dialog :open="penaltyLogOpen" @update:open="(open) => (penaltyLogOpen = open)">
      <DialogScrollContent :class="['flex flex-col gap-4 sm:max-w-lg', DIALOG_ANIMATE_CLASS]">
        <DialogHeader>
          <DialogTitle>
            {{
              penaltyLog
                ? t('reports.debt.penaltyTitle', { name: penaltyLog.residentFullName, room: penaltyLog.room ?? '—' })
                : t('reports.debt.penaltyTitleFallback')
            }}
          </DialogTitle>
        </DialogHeader>

        <p v-if="penaltyLogError" class="text-sm text-red-500">{{ penaltyLogError }}</p>
        <p v-if="penaltyLogLoading" class="text-sm text-muted-foreground">{{ t('entityTable.loading') }}</p>

        <div v-if="penaltyLog" class="flex flex-col gap-3">
          <!-- Максимум ~12 строк видно сразу, дальше — свой скролл (не растягивает
               диалог до бесконечности), шапка "прилипает" (sticky), чтобы данные не
               заезжали на неё при прокрутке — тот же приём, что у остальных таблиц
               проекта (см. ContractDetail.vue). -->
          <div class="flex max-h-[28rem] flex-col overflow-hidden rounded-md border">
            <Table>
              <TableHeader class="sticky top-0 z-10 bg-muted">
                <TableRow>
                  <TableHead :class="CELL_BORDER_CLASS">{{ t('reports.debt.colDate') }}</TableHead>
                  <TableHead :class="CELL_BORDER_CLASS">{{ t('reports.debt.colOverdueBase') }}</TableHead>
                  <TableHead>{{ t('reports.debt.colAdded') }}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-if="!penaltyLog.entries.length">
                  <TableCell colspan="3" class="text-center text-muted-foreground">{{ t('reports.debt.noPenalty') }}</TableCell>
                </TableRow>
                <TableRow v-for="(e, i) in penaltyLog.entries" :key="i">
                  <TableCell :class="CELL_BORDER_CLASS">{{ formatDateIso(e.date) }}</TableCell>
                  <TableCell :class="CELL_BORDER_CLASS">{{ formatMoney(e.overdueBase) }}</TableCell>
                  <TableCell>{{ formatMoney(e.amount) }}</TableCell>
                </TableRow>
              </TableBody>
              <TableFooter v-if="penaltyLog.entries.length">
                <TableRow>
                  <TableCell :class="CELL_BORDER_CLASS" colspan="2">{{ t('reports.common.total') }}</TableCell>
                  <TableCell>{{ formatMoney(penaltyLog.total) }}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </div>
      </DialogScrollContent>
    </Dialog>
  </div>
</template>
