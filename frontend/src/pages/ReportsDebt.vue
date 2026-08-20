<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { AlertTriangle, Banknote, CalendarClock, Users } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ReportKpiTile from '@/components/ReportKpiTile.vue'
import {
  fetchDebtors,
  fetchDebtorBreakdown,
  type DebtorRow,
  type AgingBucket,
  type DebtorBreakdown,
} from '@/lib/reports-api'

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'

const router = useRouter()

const AGING_VARIANTS: Record<AgingBucket, 'default' | 'secondary' | 'destructive'> = {
  CURRENT: 'secondary',
  D1_30: 'default',
  D31_60: 'default',
  D61_90: 'destructive',
  D90_PLUS: 'destructive',
}

function overdueLabel(daysOverdue: number, agingBucket: AgingBucket): string {
  if (agingBucket === 'CURRENT' || daysOverdue <= 0) return 'В срок'
  const mod10 = daysOverdue % 10
  const mod100 = daysOverdue % 100
  let word = 'дней'
  if (mod100 < 11 || mod100 > 14) {
    if (mod10 === 1) word = 'день'
    else if (mod10 >= 2 && mod10 <= 4) word = 'дня'
  }
  return `${daysOverdue} ${word} просрочки`
}

const debtors = ref<DebtorRow[]>([])
const isLoading = ref(true)
const loadError = ref('')

async function load() {
  isLoading.value = true
  loadError.value = ''
  try {
    debtors.value = await fetchDebtors()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isLoading.value = false
  }
}

onMounted(load)

const debtorsCount = computed(() => debtors.value.length)
const totalDebt = computed(() => debtors.value.reduce((sum, d) => sum + d.totalBalance, 0))
const overdueDebt = computed(() => debtors.value.filter((d) => d.daysOverdue > 0).reduce((sum, d) => sum + d.totalBalance, 0))
const avgDebt = computed(() => (debtorsCount.value > 0 ? totalDebt.value / debtorsCount.value : 0))

function formatMoney(value: number): string {
  return `${value.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`
}
function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('ru-RU')
}

// --- Структура долга по клику на должника ---
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
    <h1 class="text-lg font-medium">Задолженность</h1>

    <p v-if="loadError" class="text-sm text-red-500">{{ loadError }}</p>
    <p v-if="isLoading" class="text-sm text-muted-foreground">Загрузка…</p>

    <template v-else>
      <Card class="grid grid-cols-4 gap-4 p-4">
        <ReportKpiTile
          :icon="Users"
          bg-class="bg-blue-100 dark:bg-blue-500/15"
          icon-class="text-blue-600 dark:text-blue-400"
          label="Должников"
          :value="String(debtorsCount)"
        />
        <ReportKpiTile
          :icon="Banknote"
          bg-class="bg-red-100 dark:bg-red-500/15"
          icon-class="text-red-600 dark:text-red-400"
          label="Общий долг"
          :value="formatMoney(totalDebt)"
        />
        <ReportKpiTile
          :icon="AlertTriangle"
          bg-class="bg-orange-100 dark:bg-orange-500/15"
          icon-class="text-orange-600 dark:text-orange-400"
          label="Просрочено"
          :value="formatMoney(overdueDebt)"
        />
        <ReportKpiTile
          :icon="CalendarClock"
          bg-class="bg-violet-100 dark:bg-violet-500/15"
          icon-class="text-violet-600 dark:text-violet-400"
          label="Средний долг"
          :value="formatMoney(avgDebt)"
        />
      </Card>

      <Card class="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden py-0">
        <p v-if="!debtors.length" class="p-6 text-sm text-muted-foreground">Должников нет</p>
        <div v-else class="flex min-h-0 flex-1 flex-col">
          <Table>
            <TableHeader class="sticky top-0 z-10 bg-muted">
              <TableRow>
                <TableHead>№ договора</TableHead>
                <TableHead>Проживающий</TableHead>
                <TableHead>Комната</TableHead>
                <TableHead>Начислено</TableHead>
                <TableHead>Оплачено</TableHead>
                <TableHead>Долг</TableHead>
                <TableHead>Пеня</TableHead>
                <TableHead>Просрочка</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="d in debtors" :key="d.contractId" class="cursor-pointer" @click="openBreakdown(d.contractId)">
                <TableCell>{{ d.contractNumber }}</TableCell>
                <TableCell>{{ d.residentFullName }}</TableCell>
                <TableCell>{{ d.room ?? '—' }}</TableCell>
                <TableCell>{{ formatMoney(d.totalAccrued) }}</TableCell>
                <TableCell>{{ formatMoney(d.totalPaid) }}</TableCell>
                <TableCell class="font-medium text-red-500">{{ formatMoney(d.totalBalance) }}</TableCell>
                <TableCell>{{ d.penaltyBalance ? formatMoney(d.penaltyBalance) : '—' }}</TableCell>
                <TableCell>
                  <Badge :variant="AGING_VARIANTS[d.agingBucket]">{{ overdueLabel(d.daysOverdue, d.agingBucket) }}</Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>
    </template>

    <Dialog :open="breakdownOpen" @update:open="(open) => (breakdownOpen = open)">
      <DialogScrollContent :class="['flex flex-col gap-4 sm:max-w-2xl', DIALOG_ANIMATE_CLASS]">
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
                  <TableHead>Период</TableHead>
                  <TableHead>Начислено</TableHead>
                  <TableHead>Оплачено</TableHead>
                  <TableHead>Долг</TableHead>
                  <TableHead>Дней просрочки</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow
                  v-for="p in breakdown.periods"
                  :key="p.id"
                  class="cursor-pointer"
                  @click="router.push({ name: 'contract-detail', params: { id: breakdown!.contractId } })"
                >
                  <TableCell :class="p.voidedAt ? 'text-muted-foreground line-through' : ''">
                    {{ formatDate(p.periodStart) }} — {{ formatDate(p.periodEnd) }}
                  </TableCell>
                  <TableCell>{{ formatMoney(p.total) }}</TableCell>
                  <TableCell>{{ formatMoney(p.paid) }}</TableCell>
                  <TableCell :class="p.balance > 0 ? 'text-red-500' : ''">{{ formatMoney(p.balance) }}</TableCell>
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
