<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft, Ban, Plus } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogScrollContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import DatePickerField from '@/components/DatePickerField.vue'
import { fetchContractDetail, terminateContract, type ContractDetail, type PaymentMethod, type PaymentRow } from '@/lib/contracts-api'
import { STATUS_LABELS, STATUS_VARIANTS } from '@/lib/contracts-format'
import { createPayment, reversePayment } from '@/lib/billing-api'

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
// Вертикальные разделители колонок — тот же приём, что и в общей таблице (EntityTable.vue),
// для визуального единства всех таблиц в приложении.
const CELL_BORDER_CLASS = 'border-r border-border last:border-r-0'

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Наличные',
  CARD_ACQUIRING: 'Эквайринг',
  BANK_TRANSFER: 'Банковский перевод',
  MAT_CAPITAL: 'Материнский капитал',
  WEBSITE: 'Сайт',
}

const route = useRoute()
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
// Найм официально включает коммунальные услуги (см. Комнаты → характеристика
// "Стоимость") — отдельного поля "коммуналка" пользователю не показываем нигде.
const rentWithUtilities = computed(() => {
  const terms = contract.value?.terms[0]
  return terms ? terms.rentAmount + terms.utilitiesAmount : 0
})

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
  <div class="flex flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-7" as-child>
        <RouterLink to="/contracts">
          <ArrowLeft class="text-primary" />
          <span class="sr-only">К списку договоров</span>
        </RouterLink>
      </Button>
      <h1 class="text-lg font-medium">{{ contract ? `Договор № ${contract.number}` : 'Договор' }}</h1>
      <Badge v-if="contract" :variant="STATUS_VARIANTS[contract.status]">{{ STATUS_LABELS[contract.status] }}</Badge>
    </div>

    <p v-if="loadError" class="text-sm text-red-500">{{ loadError }}</p>
    <p v-if="isLoading" class="text-sm text-muted-foreground">Загрузка…</p>

    <template v-if="contract">
      <div class="flex items-start justify-between">
        <p class="text-sm text-muted-foreground">
          {{ contract.residentFullName }} · комната {{ contract.currentRoom?.room ?? '—' }} ·
          {{ formatDate(contract.startDate) }} — {{ formatDate(contract.actualEndDate ?? contract.endDate) }}
        </p>
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
          <p class="text-sm text-muted-foreground">Найм, ₽/мес <span class="text-xs">(с учётом коммунальных услуг)</span></p>
          <p class="text-lg">{{ formatMoney(rentWithUtilities) }}</p>
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
                <TableHead :class="CELL_BORDER_CLASS">Период</TableHead>
                <TableHead :class="CELL_BORDER_CLASS">Срок оплаты</TableHead>
                <TableHead :class="CELL_BORDER_CLASS">Найм</TableHead>
                <TableHead :class="CELL_BORDER_CLASS">Пеня</TableHead>
                <TableHead :class="CELL_BORDER_CLASS">Корректировка</TableHead>
                <TableHead :class="CELL_BORDER_CLASS">Оплачено</TableHead>
                <TableHead>Остаток</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="a in contract.accruals" :key="a.id" :class="a.voidedAt ? 'opacity-40' : ''">
                <TableCell :class="CELL_BORDER_CLASS">{{ formatDate(a.periodStart) }} — {{ formatDate(a.periodEnd) }}</TableCell>
                <TableCell :class="CELL_BORDER_CLASS">{{ formatDate(a.dueDate) }}</TableCell>
                <TableCell :class="CELL_BORDER_CLASS">{{ formatMoney(a.rentAmount + a.utilitiesAmount) }}</TableCell>
                <TableCell :class="CELL_BORDER_CLASS">{{ a.penaltyAmount ? formatMoney(a.penaltyAmount) : '—' }}</TableCell>
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

      <Card class="min-w-0 gap-0 py-0">
        <div class="border-b p-3 text-sm font-medium">Платежи</div>
        <div class="overflow-hidden rounded-b-lg">
          <p v-if="!contract.payments.length" class="p-6 text-sm text-muted-foreground">Платежей пока нет</p>
          <Table v-else>
            <TableHeader class="bg-muted">
              <TableRow>
                <TableHead :class="CELL_BORDER_CLASS">Дата</TableHead>
                <TableHead :class="CELL_BORDER_CLASS">Сумма</TableHead>
                <TableHead :class="CELL_BORDER_CLASS">Способ</TableHead>
                <TableHead :class="CELL_BORDER_CLASS">Комментарий</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="p in contract.payments" :key="p.id" :class="p.reversedAt ? 'opacity-40' : ''">
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
          <Button :disabled="isSavingPayment" @click="submitPayment">Сохранить</Button>
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
            :disabled="isReversing"
            @click="confirmReversePayment"
          >
            Да, сторнировать
          </Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>
  </div>
</template>
