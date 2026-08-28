<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Check, Clock, ExternalLink, Loader, Wallet, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { fetchMyPayments, fetchPaymentIntent, type MyPaymentsData, type PaymentIntentRow, type PaymentIntentStatus } from '@/lib/my-payments-api'
import { dateLocaleTag } from '@/lib/format-locale'
import { goBack } from '@/lib/utils'

// Собственная форма создания платежа отсюда убрана 2026-08-27 — с 2026-08-25 она и так
// была скрыта из навигации в пользу модалки CreatePaymentDialog.vue (сайдбар/карточка
// договора), но сам дублирующий код тут не трогали. Оставлять его дальше было уже не
// просто избыточно: пеня в модалке переведена на отдельный penaltyOnly-режим (см.
// CreatePaymentDialog.vue/my-payments.controller.ts — платится всегда отдельным платежом,
// backend больше не принимает старый includePenalty), так что старая форма здесь тихо
// показывала бы сумму "с пеней", а реально создавала бы платёж без нее — несоответствие,
// не безобидный дубль. Роут (см. router/index.ts) остаётся — нужен как returnUrl-цель
// после редиректа из банка (see my-payments.controller.ts#createIntent), эта страница
// теперь только показывает статус возврата и историю платежей.
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

    <!-- h-[60vh] на мобильном — см. EntityTable.vue: явная гарантированная высота вместо
         хрупкой пропагации min-h-0 через цепочку flex-родителей. -->
    <Card v-if="data?.contract" class="flex h-[60vh] flex-col gap-0 overflow-hidden py-0 md:h-auto md:min-h-0 md:flex-1">
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
  </div>
</template>
