<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { AlertTriangle, ArrowLeft, CalendarClock, CalendarRange, FileX, Home, Receipt, Wallet } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import ContractStatusPill from '@/components/ContractStatusPill.vue'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { fetchMyContract, type MyContractDetail } from '@/lib/contracts-api'
import { goBack } from '@/lib/utils'

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

async function load() {
  isLoading.value = true
  loadError.value = ''
  try {
    contract.value = await fetchMyContract()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isLoading.value = false
  }
}

onMounted(load)

const totalBalance = computed(() =>
  contract.value ? contract.value.accruals.reduce((sum, a) => sum + a.balance, 0) + contract.value.penaltyBalance : 0,
)
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
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/')">
        <ArrowLeft class="text-primary" />
        <span class="sr-only">Назад</span>
      </Button>
      <h1 class="text-lg font-medium">{{ contract ? `Договор № ${contract.number}` : 'Информация о договоре' }}</h1>
      <ContractStatusPill v-if="contract" :status="contract.status" />
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
      <Card class="flex flex-col gap-4 p-4">
        <div class="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span v-if="contract.currentRoom" class="flex items-center gap-1.5">
            <Home class="size-4 shrink-0 text-primary" />
            Комната {{ contract.currentRoom.room }}
          </span>
          <span class="flex items-center gap-1.5">
            <CalendarRange class="size-4 shrink-0 text-primary" />
            {{ formatDate(contract.startDate) }} — {{ formatDate(contract.actualEndDate ?? contract.endDate) }}
          </span>
        </div>

        <div class="grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-4">
          <div class="flex items-center gap-3">
            <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-500/15">
              <Wallet class="size-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p class="text-xs text-muted-foreground">Общий баланс</p>
              <p class="text-lg font-semibold" :class="totalBalance > 0 ? 'text-red-500' : 'text-green-600'">
                {{ formatMoney(totalBalance) }}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-500/15">
              <Home class="size-5 text-emerald-600 dark:text-emerald-400" />
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
            <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-500/15">
              <AlertTriangle class="size-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p class="text-xs text-muted-foreground">Пеня</p>
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
                    <TableHead :class="CELL_BORDER_CLASS">Период</TableHead>
                    <TableHead :class="CELL_BORDER_CLASS">Срок оплаты</TableHead>
                    <TableHead :class="CELL_BORDER_CLASS">Найм</TableHead>
                    <TableHead :class="CELL_BORDER_CLASS">Оплачено</TableHead>
                    <TableHead>Остаток</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="a in contract.accruals" :key="a.id" :class="a.voidedAt ? 'opacity-40' : ''">
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

        <TabsContent value="payments" class="flex min-h-0 flex-1 flex-col">
          <Card class="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden py-0">
            <p v-if="!contract.payments.length" class="p-6 text-sm text-muted-foreground">Платежей пока нет</p>
            <div v-else class="flex min-h-0 flex-1 flex-col">
              <Table>
                <TableHeader class="sticky top-0 z-10 bg-muted">
                  <TableRow>
                    <TableHead :class="CELL_BORDER_CLASS">Дата</TableHead>
                    <TableHead :class="CELL_BORDER_CLASS">Сумма</TableHead>
                    <TableHead>Комментарий</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="p in contract.payments" :key="p.id" :class="p.reversedAt ? 'opacity-40' : ''">
                    <TableCell :class="CELL_BORDER_CLASS">{{ formatDate(p.paidAt) }}</TableCell>
                    <TableCell :class="CELL_BORDER_CLASS">{{ formatMoney(p.amount) }}</TableCell>
                    <TableCell>{{ p.rawComment ?? '—' }}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </template>
  </div>
</template>
