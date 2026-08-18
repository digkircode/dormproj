<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Plus, RotateCcw } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { fetchContractDetail, terminateContract, type ContractDetail, type PaymentMethod } from '@/lib/contracts-api'
import { createPayment, reversePayment } from '@/lib/billing-api'

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'

const STATUS_LABELS: Record<string, string> = { ACTIVE: 'Действует', TERMINATED: 'Расторгнут', EXPIRED: 'Истёк' }
const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive'> = {
  ACTIVE: 'default',
  TERMINATED: 'destructive',
  EXPIRED: 'secondary',
}
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
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isLoading.value = false
  }
}

onMounted(load)

const totalBalance = computed(() => (contract.value ? contract.value.accruals.reduce((sum, a) => sum + a.balance, 0) : 0))

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

// --- Внесение платежа ---
const isPaymentOpen = ref(false)
const paymentAmount = ref<number | undefined>(undefined)
const paymentDate = ref('')
const paymentMethod = ref<PaymentMethod>('CASH')
const paymentComment = ref('')
const paymentError = ref('')
const isSavingPayment = ref(false)

function openPayment() {
  paymentAmount.value = totalBalance.value > 0 ? Math.round(totalBalance.value * 100) / 100 : undefined
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

async function onReversePayment(paymentId: number) {
  await reversePayment(paymentId)
  await load()
}
</script>

<template>
  <div class="flex flex-1 flex-col gap-4 p-4 md:p-6">
    <Button variant="ghost" size="sm" class="w-fit" @click="router.push({ name: 'contracts' })">
      <ArrowLeft />
      К списку договоров
    </Button>

    <p v-if="loadError" class="text-sm text-red-500">{{ loadError }}</p>
    <p v-if="isLoading" class="text-sm text-muted-foreground">Загрузка…</p>

    <template v-if="contract">
      <div class="flex items-start justify-between">
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-lg font-medium">Договор № {{ contract.number }}</h1>
            <Badge :variant="STATUS_VARIANTS[contract.status]">{{ STATUS_LABELS[contract.status] }}</Badge>
          </div>
          <p class="text-sm text-muted-foreground">
            {{ contract.residentFullName }} · комната {{ contract.currentRoom?.room ?? '—' }} ·
            {{ formatDate(contract.startDate) }} — {{ formatDate(contract.actualEndDate ?? contract.endDate) }}
          </p>
        </div>
        <div class="flex gap-2">
          <Button v-if="contract.status === 'ACTIVE'" variant="outline" @click="openTerminate">Расторгнуть</Button>
          <Button @click="openPayment">
            <Plus />
            Внести платёж
          </Button>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-4">
        <Card class="p-4">
          <p class="text-sm text-muted-foreground">Общий баланс</p>
          <p class="text-2xl font-semibold" :class="totalBalance > 0 ? 'text-red-500' : 'text-green-600'">
            {{ formatMoney(totalBalance) }}
          </p>
        </Card>
        <Card class="p-4">
          <p class="text-sm text-muted-foreground">Найм / коммуналка</p>
          <p class="text-lg">{{ formatMoney(contract.terms[0]?.rentAmount ?? 0) }} / {{ formatMoney(contract.terms[0]?.utilitiesAmount ?? 0) }}</p>
        </Card>
        <Card class="p-4">
          <p class="text-sm text-muted-foreground">Суточная ставка</p>
          <p class="text-lg">{{ formatMoney(contract.terms[0]?.dailyRateAmount ?? 0) }}</p>
        </Card>
      </div>

      <Card class="min-w-0 gap-0 py-0">
        <div class="border-b p-3 text-sm font-medium">Начисления</div>
        <div class="overflow-hidden rounded-b-lg">
          <Table>
            <TableHeader class="bg-muted">
              <TableRow>
                <TableHead>Период</TableHead>
                <TableHead>Срок оплаты</TableHead>
                <TableHead>Найм</TableHead>
                <TableHead>Коммуналка</TableHead>
                <TableHead>Пеня</TableHead>
                <TableHead>Корректировка</TableHead>
                <TableHead>Оплачено</TableHead>
                <TableHead>Остаток</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="a in contract.accruals" :key="a.id" :class="a.voidedAt ? 'opacity-40' : ''">
                <TableCell>{{ formatDate(a.periodStart) }} — {{ formatDate(a.periodEnd) }}</TableCell>
                <TableCell>{{ formatDate(a.dueDate) }}</TableCell>
                <TableCell>{{ formatMoney(a.rentAmount) }}</TableCell>
                <TableCell>{{ formatMoney(a.utilitiesAmount) }}</TableCell>
                <TableCell>{{ a.penaltyAmount ? formatMoney(a.penaltyAmount) : '—' }}</TableCell>
                <TableCell>{{ a.adjustmentAmount ? formatMoney(a.adjustmentAmount) : '—' }}</TableCell>
                <TableCell>{{ formatMoney(a.paid) }}</TableCell>
                <TableCell :class="a.balance > 0 ? 'text-red-500' : ''">
                  {{ a.voidedAt ? 'отменено' : formatMoney(a.balance) }}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card class="min-w-0 gap-0 py-0">
        <div class="border-b p-3 text-sm font-medium">Платежи</div>
        <div class="overflow-hidden rounded-b-lg">
          <p v-if="!contract.payments.length" class="p-6 text-sm text-muted-foreground">Платежей пока нет</p>
          <Table v-else>
            <TableHeader class="bg-muted">
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead>Сумма</TableHead>
                <TableHead>Способ</TableHead>
                <TableHead>Комментарий</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="p in contract.payments" :key="p.id" :class="p.reversedAt ? 'opacity-40' : ''">
                <TableCell>{{ formatDate(p.paidAt) }}</TableCell>
                <TableCell>{{ formatMoney(p.amount) }}</TableCell>
                <TableCell>{{ METHOD_LABELS[p.method] ?? p.method }}</TableCell>
                <TableCell>{{ p.rawComment ?? '—' }}</TableCell>
                <TableCell class="text-right">
                  <span v-if="p.reversedAt" class="text-xs text-muted-foreground">сторнирован</span>
                  <Button v-else variant="ghost" size="icon" class="size-7" @click="onReversePayment(p.id)">
                    <RotateCcw class="text-muted-foreground" />
                    <span class="sr-only">Сторнировать</span>
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>
    </template>

    <Dialog :open="isTerminateOpen" @update:open="(open) => (isTerminateOpen = open)">
      <DialogScrollContent :class="['flex flex-col gap-4', DIALOG_ANIMATE_CLASS]">
        <DialogHeader>
          <DialogTitle>Расторгнуть договор</DialogTitle>
        </DialogHeader>
        <div class="flex flex-col gap-2">
          <Label>Фактическая дата выезда</Label>
          <Input v-model="actualEndDate" type="date" />
        </div>
        <p v-if="terminateError" class="text-sm text-red-500">{{ terminateError }}</p>
        <DialogFooter>
          <Button variant="outline" @click="isTerminateOpen = false">Отмена</Button>
          <Button :disabled="isTerminating" @click="submitTerminate">Расторгнуть</Button>
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
            <Input v-model.number="paymentAmount" type="number" />
          </div>
          <div class="flex flex-col gap-2">
            <Label>Дата</Label>
            <Input v-model="paymentDate" type="date" />
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
          <Button :disabled="isSavingPayment" @click="submitPayment">Сохранить</Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>
  </div>
</template>
