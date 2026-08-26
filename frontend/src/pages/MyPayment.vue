<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Clock,
  CreditCard,
  ExternalLink,
  Loader,
  Percent,
  Wallet,
  X,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import {
  fetchMyPayments,
  createPaymentIntent,
  fetchPaymentIntent,
  type MyPaymentsData,
  type OpenAccrualRow,
  type PaymentIntentRow,
  type PaymentIntentStatus,
} from '@/lib/my-payments-api'
import { dateLocaleTag } from '@/lib/format-locale'
import { goBack, sanitizeLettersOnly } from '@/lib/utils'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()

const data = ref<MyPaymentsData | null>(null)
const isLoading = ref(true)
const loadError = ref('')

async function load() {
  isLoading.value = true
  loadError.value = ''
  try {
    data.value = await fetchMyPayments()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isLoading.value = false
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(dateLocaleTag())
}
function formatMoney(value: number): string {
  return `${value.toLocaleString(dateLocaleTag(), { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`
}
function monthLabel(periodStart: string): string {
  return new Date(periodStart).toLocaleDateString(dateLocaleTag(), { month: 'long', year: 'numeric' })
}

// --- Форма создания платежа ---
type AmountMode = 'select' | 'custom'
const amountMode = ref<AmountMode>('select')
const selectedAccrualIds = ref<number[]>([])
const includePenalty = ref(false)
const customAmount = ref<number | undefined>(undefined)

const openAccruals = computed<OpenAccrualRow[]>(() => data.value?.openAccruals ?? [])
const penaltyBalance = computed(() => data.value?.penaltyBalance ?? 0)
// Пеню можно выбрать, только если этим же платежом закрываются ВСЕ открытые начисления —
// иначе деньги по FIFO уйдут сначала на начисления, а не на пеню (см. промпт задачи).
const canSelectPenalty = computed(() => openAccruals.value.length > 0 && selectedAccrualIds.value.length === openAccruals.value.length)

function toggleAccrual(id: number, checked: boolean) {
  selectedAccrualIds.value = checked ? [...selectedAccrualIds.value, id] : selectedAccrualIds.value.filter((v) => v !== id)
  if (!canSelectPenalty.value) includePenalty.value = false
}

const selectedAmount = computed(() => {
  const accrualsSum = openAccruals.value
    .filter((a) => selectedAccrualIds.value.includes(a.id))
    .reduce((sum, a) => sum + a.balance, 0)
  return accrualsSum + (includePenalty.value ? penaltyBalance.value : 0)
})
const finalAmount = computed(() => (amountMode.value === 'custom' ? customAmount.value ?? 0 : selectedAmount.value))

const payerIsResident = ref(true)
const representativeFullName = ref('')
const payerEmail = ref('')

const canSubmit = computed(() => {
  if (finalAmount.value <= 0) return false
  if (!payerIsResident.value && !representativeFullName.value.trim()) return false
  if (!payerEmail.value.trim()) return false
  return true
})

const isSubmitting = ref(false)
const submitError = ref('')

async function submit() {
  if (!canSubmit.value) return
  isSubmitting.value = true
  submitError.value = ''
  try {
    const { paymentPageUrl } = await createPaymentIntent({
      accrualIds: amountMode.value === 'select' ? selectedAccrualIds.value : [],
      includePenalty: amountMode.value === 'select' ? includePenalty.value : false,
      customAmount: amountMode.value === 'custom' ? (customAmount.value ?? null) : null,
      payerIsResident: payerIsResident.value,
      representativeFullName: payerIsResident.value ? null : representativeFullName.value.trim(),
      payerEmail: payerEmail.value.trim(),
    })
    window.location.href = paymentPageUrl
  } catch (error) {
    submitError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isSubmitting.value = false
  }
}

// --- Возврат с платёжной страницы банка (?intentId=) — опрашиваем статус сами, не
// доверяем самому факту редиректа обратно (см. промпт задачи). ---
const returningIntent = ref<PaymentIntentRow | null>(null)
const isPolling = ref(false)
let pollTimeout: ReturnType<typeof setTimeout> | undefined

async function pollIntent(id: number) {
  isPolling.value = true
  try {
    const intent = await fetchPaymentIntent(id)
    returningIntent.value = intent
    if (intent.status === 'PENDING_BANK' || intent.status === 'CREATED') {
      pollTimeout = setTimeout(() => pollIntent(id), 2500)
      return
    }
    if (intent.status === 'SUCCEEDED') await load()
  } catch {
    // Тихо игнорируем — следующий заход на страницу/ручное обновление попробует снова.
  } finally {
    isPolling.value = false
  }
}
onUnmounted(() => clearTimeout(pollTimeout))

// Proxy, не обычный объект — тот же приём, что STATUS_LABELS в contracts-format.ts,
// реактивен к смене языка (те же ключи payment.status.*, что и UNIFIED_PAYMENT_STATUS_LABELS
// в my-payments-api.ts, плюс SUCCEEDED — там его нет, PaymentIntentStatus его исключает
// из UnifiedPaymentStatus, но сам intent до слияния в леджер им может быть).
const STATUS_LABELS: Record<PaymentIntentStatus, string> = new Proxy({} as Record<PaymentIntentStatus, string>, {
  get: (_target, status: string) => t(`payment.status.${status}`),
})
const STATUS_ICON = { CREATED: Clock, PENDING_BANK: Clock, SUCCEEDED: Check, FAILED: X, CANCELED: X, EXPIRED: X } as const
const STATUS_ICON_CLASS: Record<PaymentIntentStatus, string> = {
  CREATED: 'text-muted-foreground',
  PENDING_BANK: 'text-orange-500',
  SUCCEEDED: 'text-emerald-500',
  FAILED: 'text-red-500',
  CANCELED: 'text-muted-foreground',
  EXPIRED: 'text-muted-foreground',
}

onMounted(async () => {
  await load()
  const intentId = Number(route.query.intentId)
  if (Number.isInteger(intentId) && intentId > 0) {
    await pollIntent(intentId)
  }
})
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/student/contract')">
        <ArrowLeft class="text-primary" />
        <span class="sr-only">{{ t('payment.myPayment.back') }}</span>
      </Button>
      <h1 class="text-lg font-medium">{{ t('payment.myPayment.title') }}</h1>
    </div>

    <p v-if="loadError" class="text-sm text-red-500">{{ loadError }}</p>
    <p v-if="isLoading" class="text-sm text-muted-foreground">{{ t('entityTable.loading') }}</p>

    <Card
      v-if="returningIntent"
      class="flex items-center gap-3 p-4"
      :class="{
        'border-emerald-500/40 bg-emerald-500/5': returningIntent.status === 'SUCCEEDED',
        'border-red-500/40 bg-red-500/5': returningIntent.status === 'FAILED',
      }"
    >
      <Loader v-if="isPolling || returningIntent.status === 'PENDING_BANK'" class="size-5 shrink-0 animate-spin text-orange-500" />
      <component :is="STATUS_ICON[returningIntent.status]" v-else class="size-5 shrink-0" :class="STATUS_ICON_CLASS[returningIntent.status]" />
      <div class="flex flex-col">
        <p class="text-sm font-medium">
          {{ returningIntent.status === 'PENDING_BANK' ? t('payment.myPayment.waitingBank') : STATUS_LABELS[returningIntent.status] }}
        </p>
        <p v-if="returningIntent.failureReason" class="text-sm text-muted-foreground">{{ returningIntent.failureReason }}</p>
      </div>
    </Card>

    <Card v-if="!isLoading && !loadError && !data?.contract" class="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <p class="text-sm font-medium">{{ t('contracts.myContract.noContractFound') }}</p>
    </Card>

    <template v-if="data?.contract">
      <Card v-if="!data.acquiringAvailable" class="flex items-center gap-3 p-4">
        <AlertTriangle class="size-5 shrink-0 text-orange-500" />
        <p class="text-sm">{{ t('payment.myPayment.acquiringUnavailable') }}</p>
      </Card>

      <Card v-else class="flex flex-col gap-4 p-4">
        <p class="flex items-center gap-1.5 text-sm font-medium">
          <CreditCard class="size-4 text-primary" />
          {{ t('payment.createDialog.title') }}
        </p>

        <div class="flex w-fit items-center gap-1 rounded-md border p-0.5">
          <Button :variant="amountMode === 'select' ? 'default' : 'ghost'" size="sm" @click="amountMode = 'select'">
            {{ t('payment.createDialog.chooseAccruals') }}
          </Button>
          <Button :variant="amountMode === 'custom' ? 'default' : 'ghost'" size="sm" @click="amountMode = 'custom'">
            {{ t('payment.createDialog.customAmount') }}
          </Button>
        </div>

        <template v-if="amountMode === 'select'">
          <p v-if="!openAccruals.length" class="text-sm text-muted-foreground">{{ t('payment.createDialog.noOpenAccruals') }}</p>
          <div v-else class="flex flex-col gap-2">
            <label
              v-for="accrual in openAccruals"
              :key="accrual.id"
              class="flex cursor-pointer items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent"
            >
              <span class="flex items-center gap-2">
                <Checkbox
                  :model-value="selectedAccrualIds.includes(accrual.id)"
                  @update:model-value="(checked) => toggleAccrual(accrual.id, !!checked)"
                />
                {{ monthLabel(accrual.periodStart) }}
              </span>
              <span class="font-medium">{{ formatMoney(accrual.balance) }}</span>
            </label>
            <label
              v-if="penaltyBalance > 0"
              class="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              :class="canSelectPenalty ? 'cursor-pointer hover:bg-accent' : 'cursor-not-allowed opacity-50'"
              :title="canSelectPenalty ? '' : t('payment.createDialog.penaltySelectAllHint')"
            >
              <span class="flex items-center gap-2">
                <Checkbox :model-value="includePenalty" :disabled="!canSelectPenalty" @update:model-value="(v) => (includePenalty = !!v)" />
                <Percent class="size-3.5 text-orange-500" />
                {{ t('payment.createDialog.penaltyFull') }}
              </span>
              <span class="font-medium">{{ formatMoney(penaltyBalance) }}</span>
            </label>
          </div>
        </template>
        <template v-else>
          <div class="flex flex-col gap-2">
            <Label for="custom-amount">{{ t('payment.createDialog.amountPlaceholder') }}</Label>
            <Input id="custom-amount" v-model.number="customAmount" type="number" min="1" placeholder="0" />
          </div>
        </template>

        <div class="flex flex-col gap-3 border-t pt-4">
          <div class="flex w-fit items-center gap-1 rounded-md border p-0.5">
            <Button :variant="payerIsResident ? 'default' : 'ghost'" size="sm" @click="payerIsResident = true">
              {{ t('payment.myPayment.payerIsResidentMe') }}
            </Button>
            <Button :variant="!payerIsResident ? 'default' : 'ghost'" size="sm" @click="payerIsResident = false">
              {{ t('payment.createDialog.payerIsOther') }}
            </Button>
          </div>
          <div v-if="!payerIsResident" class="flex flex-col gap-2">
            <Label for="representative-name">{{ t('payment.createDialog.representativeName') }}</Label>
            <Input
              id="representative-name"
              :model-value="representativeFullName"
              @update:model-value="(v) => (representativeFullName = sanitizeLettersOnly(String(v)))"
              :placeholder="t('payment.myPayment.representativeNamePlaceholder')"
            />
          </div>
          <div class="flex flex-col gap-2">
            <Label for="payer-email">{{ t('payment.createDialog.payerEmail') }}</Label>
            <Input id="payer-email" v-model="payerEmail" type="email" placeholder="mail@example.com" />
          </div>
        </div>

        <p v-if="submitError" class="text-sm text-red-500">{{ submitError }}</p>

        <div class="flex items-center justify-between border-t pt-4">
          <span class="text-sm text-muted-foreground">{{ t('payment.createDialog.amountDue') }}</span>
          <span class="text-lg font-semibold">{{ formatMoney(finalAmount) }}</span>
        </div>
        <Button :disabled="!canSubmit" :loading="isSubmitting" @click="submit">
          {{ t('payment.createDialog.pay', { amount: formatMoney(finalAmount) }) }}
        </Button>
      </Card>

      <Card class="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden py-0">
        <p class="flex shrink-0 items-center gap-1.5 border-b p-4 text-sm font-medium">
          <Wallet class="size-4 text-primary" />
          {{ t('payment.myPayment.paymentHistory') }}
        </p>
        <p v-if="!data.history.length" class="p-6 text-sm text-muted-foreground">{{ t('contracts.detail.noPaymentsYet') }}</p>
        <div v-else class="min-h-0 flex-1 overflow-y-auto">
          <Table>
            <TableHeader class="sticky top-0 z-10 bg-muted">
              <TableRow>
                <TableHead>{{ t('contracts.detail.colDate') }}</TableHead>
                <TableHead>{{ t('contracts.myContract.colDescription') }}</TableHead>
                <TableHead>{{ t('contracts.detail.colAmount') }}</TableHead>
                <TableHead>{{ t('contracts.list.colStatus') }}</TableHead>
                <TableHead>{{ t('contracts.myContract.colReceipt') }}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="row in data.history" :key="row.id">
                <TableCell>{{ formatDate(row.createdAt) }}</TableCell>
                <TableCell>{{ row.description }}</TableCell>
                <TableCell>{{ formatMoney(row.amount) }}</TableCell>
                <TableCell>
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
                    {{ t('payment.receipt.open') }}
                    <ExternalLink class="size-3.5" />
                  </a>
                  <span v-else class="text-muted-foreground">—</span>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>
    </template>
  </div>
</template>
