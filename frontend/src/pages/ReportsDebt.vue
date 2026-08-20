<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { AlertTriangle, ArrowLeft, Banknote, Info, Users, Wallet } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import EntityTable from '@/components/EntityTable.vue'
import ContractLinkCell from '@/components/ContractLinkCell.vue'
import ResidentLinkCell from '@/components/ResidentLinkCell.vue'
import DaysOverdueCell from '@/components/DaysOverdueCell.vue'
import DebtBalanceCell from '@/components/DebtBalanceCell.vue'
import ReportKpiTile from '@/components/ReportKpiTile.vue'
import { createAppColumnHelper } from '@/lib/table'
import {
  fetchDebtorsPage,
  fetchDebtorsFacets,
  fetchDebtorsSummary,
  fetchDebtorBreakdown,
  type DebtorRow,
  type DebtorsSummary,
  type DebtorBreakdown,
} from '@/lib/reports-api'
import { goBack } from '@/lib/utils'

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
// Вертикальные разделители колонок — тот же приём, что и в остальных таблицах
// приложения (EntityTable.vue/ContractDetail.vue), для визуального единства.
const CELL_BORDER_CLASS = 'border-r border-border last:border-r-0'

const router = useRouter()

const columnLabels: Record<string, string> = {
  contractNumber: '№ договора',
  residentFullName: 'Проживающий',
  room: 'Комната',
  totalAccrued: 'Начислено',
  totalPaid: 'Оплачено',
  penaltyBalance: 'Пеня',
  totalBalance: 'Долг',
  daysOverdue: 'Дней просрочки',
  agingBucket: 'Просрочка',
}
const filterableFields = ['agingBucket']
const cellRenderers = {
  contractNumber: ContractLinkCell,
  residentFullName: ResidentLinkCell,
  totalBalance: DebtBalanceCell,
  daysOverdue: DaysOverdueCell,
}

function formatMoney(value: number): string {
  return `${value.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`
}
function cellText(columnId: string, value: unknown): string {
  if (
    (columnId === 'totalAccrued' || columnId === 'totalPaid' || columnId === 'penaltyBalance' || columnId === 'totalBalance') &&
    typeof value === 'number'
  ) {
    return formatMoney(value)
  }
  return String(value ?? '')
}

const columnHelper = createAppColumnHelper<DebtorRow>()
const columns = columnHelper.columns([
  columnHelper.accessor('contractNumber', { header: columnLabels.contractNumber, enableHiding: false, size: 128, minSize: 100 }),
  columnHelper.accessor('residentFullName', { header: columnLabels.residentFullName, size: 220, minSize: 160 }),
  columnHelper.accessor('room', { header: columnLabels.room, size: 110, minSize: 90 }),
  columnHelper.accessor('totalAccrued', { header: columnLabels.totalAccrued, size: 130, minSize: 110 }),
  columnHelper.accessor('totalPaid', { header: columnLabels.totalPaid, size: 130, minSize: 110 }),
  columnHelper.accessor('penaltyBalance', { header: columnLabels.penaltyBalance, size: 110, minSize: 90 }),
  columnHelper.accessor('totalBalance', { header: columnLabels.totalBalance, size: 130, minSize: 110 }),
  columnHelper.accessor('daysOverdue', { header: columnLabels.daysOverdue, size: 130, minSize: 110 }),
])

const summary = ref<DebtorsSummary | null>(null)
onMounted(async () => {
  summary.value = await fetchDebtorsSummary()
})

// "Месяц" — крупно название месяца, мелко и в скобках короткий диапазон дат под ним
// (неполные месяцы на границах договора всё равно остаются понятны по датам).
function monthLabel(iso: string): string {
  const label = new Date(iso).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
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
    breakdown.value = await fetchDebtorBreakdown(contractId)
  } catch (error) {
    breakdownError.value = error instanceof Error ? error.message : String(error)
  } finally {
    breakdownLoading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/')">
        <ArrowLeft class="text-primary" />
        <span class="sr-only">Назад</span>
      </Button>
      <h1 class="text-lg font-medium">Задолженность</h1>
    </div>

    <Card v-if="summary" class="grid grid-cols-4 gap-4 p-4">
      <ReportKpiTile
        :icon="Users"
        bg-class="bg-blue-100 dark:bg-blue-500/15"
        icon-class="text-blue-600 dark:text-blue-400"
        label="Должников"
        :value="String(summary.debtorsCount)"
      />
      <ReportKpiTile
        :icon="Banknote"
        bg-class="bg-red-100 dark:bg-red-500/15"
        icon-class="text-red-600 dark:text-red-400"
        label="Общий долг"
        :value="formatMoney(summary.totalDebt)"
      />
      <ReportKpiTile
        :icon="AlertTriangle"
        bg-class="bg-orange-100 dark:bg-orange-500/15"
        icon-class="text-orange-600 dark:text-orange-400"
        label="Просрочено"
        :value="formatMoney(summary.overdueDebt)"
      />
      <ReportKpiTile
        :icon="Wallet"
        bg-class="bg-emerald-100 dark:bg-emerald-500/15"
        icon-class="text-emerald-600 dark:text-emerald-400"
        label="Всего оплачено"
        :value="formatMoney(summary.totalPaid)"
      />
    </Card>

    <EntityTable
      :columns="columns"
      :column-labels="columnLabels"
      :filterable-fields="filterableFields"
      :default-sort="{ id: 'totalBalance', desc: true }"
      :fetch-page="fetchDebtorsPage"
      :fetch-facet-values="fetchDebtorsFacets"
      :get-row-id="(d: DebtorRow) => String(d.contractId)"
      total-label="должников"
      :cell-text="cellText"
      :cell-renderers="cellRenderers"
      storage-key="reports-debt"
      accent-icons
      :row-action="{ icon: Info, label: 'Структура долга по месяцам', onClick: (d: DebtorRow) => openBreakdown(d.contractId) }"
    />

    <Dialog :open="breakdownOpen" @update:open="(open) => (breakdownOpen = open)">
      <DialogScrollContent :class="['flex flex-col gap-4 sm:max-w-3xl', DIALOG_ANIMATE_CLASS]">
        <DialogHeader>
          <DialogTitle>
            {{ breakdown ? `${breakdown.residentFullName} — комн. ${breakdown.room ?? '—'}` : 'Структура долга' }}
          </DialogTitle>
        </DialogHeader>

        <p v-if="breakdownError" class="text-sm text-red-500">{{ breakdownError }}</p>
        <p v-if="breakdownLoading" class="text-sm text-muted-foreground">Загрузка…</p>

        <div v-if="breakdown" class="flex flex-col gap-3">
          <div class="overflow-hidden rounded-md border">
            <Table>
              <TableHeader class="bg-muted">
                <TableRow>
                  <TableHead :class="CELL_BORDER_CLASS">Месяц</TableHead>
                  <TableHead :class="CELL_BORDER_CLASS">Начислено</TableHead>
                  <TableHead :class="CELL_BORDER_CLASS">Оплачено</TableHead>
                  <TableHead :class="CELL_BORDER_CLASS">Пеня</TableHead>
                  <TableHead :class="CELL_BORDER_CLASS">Долг</TableHead>
                  <TableHead>Дней просрочки</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="p in breakdown.periods" :key="p.id">
                  <TableCell :class="[CELL_BORDER_CLASS, p.voidedAt ? 'text-muted-foreground line-through' : '']">
                    <div class="flex flex-col">
                      <span>{{ monthLabel(p.periodStart) }}</span>
                      <span class="text-xs text-muted-foreground">({{ formatDateShort(p.periodStart) }}–{{ formatDateShort(p.periodEnd) }})</span>
                    </div>
                  </TableCell>
                  <TableCell :class="CELL_BORDER_CLASS">{{ formatMoney(p.total) }}</TableCell>
                  <TableCell :class="CELL_BORDER_CLASS">{{ formatMoney(p.paid) }}</TableCell>
                  <TableCell :class="CELL_BORDER_CLASS">{{ p.penaltyAmount ? formatMoney(p.penaltyAmount) : '—' }}</TableCell>
                  <TableCell :class="[CELL_BORDER_CLASS, p.balance > 0 ? 'text-red-500' : '']">{{ formatMoney(p.balance) }}</TableCell>
                  <TableCell>{{ p.daysOverdue > 0 ? p.daysOverdue : '—' }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <p class="text-right text-sm font-medium">Итого долг: {{ formatMoney(breakdown.totalDebt) }}</p>
        </div>
      </DialogScrollContent>
    </Dialog>
  </div>
</template>
