<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AlertTriangle, Banknote, FileText, Info, User, Users } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ReportKpiTile from '@/components/ReportKpiTile.vue'
import { fetchDebtors, fetchDebtorBreakdown, type DebtorRow, type DebtorBreakdown } from '@/lib/reports-api'

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
// Вертикальные разделители колонок — тот же приём, что и в остальных таблицах
// приложения (EntityTable.vue/ContractDetail.vue), для визуального единства.
const CELL_BORDER_CLASS = 'border-r border-border last:border-r-0'
// Ссылка-ячейка с иконкой (номер договора/ФИО) — тот же приём, что у ФИО на
// ContractDetail.vue: -mx/-my компенсируют паддинг ячейки под hover-подложку.
const CELL_LINK_CLASS =
  '-mx-1.5 -my-0.5 flex w-fit items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-accent-foreground'

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

function formatMoney(value: number): string {
  return `${value.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`
}
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

// --- Структура долга по месяцам — открывается отдельной кнопкой-инфо, не кликом по строке ---
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
      <Card class="grid grid-cols-3 gap-4 p-4">
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
      </Card>

      <Card class="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden py-0">
        <p v-if="!debtors.length" class="p-6 text-sm text-muted-foreground">Должников нет</p>
        <div v-else class="flex min-h-0 flex-1 flex-col">
          <Table>
            <TableHeader class="sticky top-0 z-10 bg-muted">
              <TableRow>
                <TableHead :class="CELL_BORDER_CLASS">№ договора</TableHead>
                <TableHead :class="CELL_BORDER_CLASS">Проживающий</TableHead>
                <TableHead :class="CELL_BORDER_CLASS">Комната</TableHead>
                <TableHead :class="CELL_BORDER_CLASS">Начислено</TableHead>
                <TableHead :class="CELL_BORDER_CLASS">Оплачено</TableHead>
                <TableHead :class="CELL_BORDER_CLASS">Долг</TableHead>
                <TableHead :class="CELL_BORDER_CLASS">Дней просрочки</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="d in debtors" :key="d.contractId">
                <TableCell :class="CELL_BORDER_CLASS">
                  <RouterLink :to="{ name: 'contract-detail', params: { id: d.contractId } }" :class="CELL_LINK_CLASS">
                    <FileText class="size-4 shrink-0 text-primary" />
                    {{ d.contractNumber }}
                  </RouterLink>
                </TableCell>
                <TableCell :class="CELL_BORDER_CLASS">
                  <RouterLink :to="{ name: 'individual-detail', params: { uid: d.residentIndividualUid } }" :class="CELL_LINK_CLASS">
                    <User class="size-4 shrink-0 text-primary" />
                    {{ d.residentFullName }}
                  </RouterLink>
                </TableCell>
                <TableCell :class="CELL_BORDER_CLASS">{{ d.room ?? '—' }}</TableCell>
                <TableCell :class="CELL_BORDER_CLASS">{{ formatMoney(d.totalAccrued) }}</TableCell>
                <TableCell :class="CELL_BORDER_CLASS">{{ formatMoney(d.totalPaid) }}</TableCell>
                <TableCell class="font-medium text-red-500" :class="CELL_BORDER_CLASS">{{ formatMoney(d.totalBalance) }}</TableCell>
                <TableCell :class="[CELL_BORDER_CLASS, d.daysOverdue > 0 ? 'text-red-500' : 'text-muted-foreground']">
                  {{ d.daysOverdue > 0 ? d.daysOverdue : '—' }}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" class="size-7" @click="openBreakdown(d.contractId)">
                    <Info class="text-primary" />
                    <span class="sr-only">Структура долга по месяцам</span>
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>
    </template>

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
