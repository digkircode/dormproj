<script setup lang="ts">
import { computed, ref } from 'vue'
import { AlertTriangle, CreditCard, Percent } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  fetchMyPayments,
  createPaymentIntent,
  type MyPaymentsData,
  type OpenAccrualRow,
} from '@/lib/my-payments-api'

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'

const isDialogOpen = ref(false)
const isLoading = ref(true)
const loadError = ref('')
const data = ref<MyPaymentsData | null>(null)

function monthLabel(periodStart: string): string {
  return new Date(periodStart).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
}
function formatMoney(value: number): string {
  return `${value.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`
}

// --- Форма создания платежа — та же логика, что была на отдельной странице /student/payment
// (см. историю MyPayment.vue), перенесена в модалку по прямой просьбе 2026-08-25: кнопка
// "Оплатить" на карточке договора больше никуда не переходит, а сразу открывает эту форму. ---
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
const payerPhone = ref('')

const canSubmit = computed(() => {
  if (finalAmount.value <= 0) return false
  if (!payerIsResident.value && !representativeFullName.value.trim()) return false
  if (!payerEmail.value.trim() && !payerPhone.value.trim()) return false
  return true
})

const isSubmitting = ref(false)
const submitError = ref('')

async function open() {
  amountMode.value = 'select'
  selectedAccrualIds.value = []
  includePenalty.value = false
  customAmount.value = undefined
  payerIsResident.value = true
  representativeFullName.value = ''
  payerEmail.value = ''
  payerPhone.value = ''
  submitError.value = ''
  loadError.value = ''
  isDialogOpen.value = true

  isLoading.value = true
  try {
    data.value = await fetchMyPayments()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isLoading.value = false
  }
}
defineExpose({ open })

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
      payerEmail: payerEmail.value.trim() || null,
      payerPhone: payerPhone.value.trim() || null,
    })
    window.location.href = paymentPageUrl
  } catch (error) {
    submitError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <Dialog :open="isDialogOpen" @update:open="(open) => (isDialogOpen = open)">
    <DialogScrollContent :class="['flex flex-col gap-4 sm:max-w-md', DIALOG_ANIMATE_CLASS]">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-1.5">
          <CreditCard class="size-4 text-primary" />
          Новый платёж
        </DialogTitle>
      </DialogHeader>

      <p v-if="loadError" class="text-sm text-red-500">{{ loadError }}</p>
      <p v-if="isLoading" class="text-sm text-muted-foreground">Загрузка…</p>

      <template v-if="!isLoading && !loadError && data">
        <Card v-if="!data.acquiringAvailable" class="flex items-center gap-3 rounded-md border p-4">
          <AlertTriangle class="size-5 shrink-0 text-orange-500" />
          <p class="text-sm">Оплата временно недоступна — эквайринг ещё не подключён. Попробуйте позже.</p>
        </Card>

        <div v-else class="flex flex-col gap-4">
          <div class="flex w-fit items-center gap-1 rounded-md border p-0.5">
            <Button :variant="amountMode === 'select' ? 'default' : 'ghost'" size="sm" @click="amountMode = 'select'">
              Выбрать начисления
            </Button>
            <Button :variant="amountMode === 'custom' ? 'default' : 'ghost'" size="sm" @click="amountMode = 'custom'"> Своя сумма </Button>
          </div>

          <template v-if="amountMode === 'select'">
            <p v-if="!openAccruals.length" class="text-sm text-muted-foreground">Непогашенных начислений нет.</p>
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
                :title="canSelectPenalty ? '' : 'Сначала выберите все открытые начисления — иначе платёж сначала погасит их'"
              >
                <span class="flex items-center gap-2">
                  <Checkbox :model-value="includePenalty" :disabled="!canSelectPenalty" @update:model-value="(v) => (includePenalty = !!v)" />
                  <Percent class="size-3.5 text-orange-500" />
                  Пеня целиком
                </span>
                <span class="font-medium">{{ formatMoney(penaltyBalance) }}</span>
              </label>
            </div>
          </template>
          <template v-else>
            <div class="flex flex-col gap-2">
              <Label for="custom-amount">Сумма</Label>
              <Input id="custom-amount" v-model.number="customAmount" type="number" min="1" placeholder="0" />
            </div>
          </template>

          <div class="flex flex-col gap-3 border-t pt-4">
            <div class="flex w-fit items-center gap-1 rounded-md border p-0.5">
              <Button :variant="payerIsResident ? 'default' : 'ghost'" size="sm" @click="payerIsResident = true"> Я оплачиваю сам(а) </Button>
              <Button :variant="!payerIsResident ? 'default' : 'ghost'" size="sm" @click="payerIsResident = false"> Оплачивает другой человек </Button>
            </div>
            <div v-if="!payerIsResident" class="flex flex-col gap-2">
              <Label for="representative-name">ФИО плательщика</Label>
              <Input id="representative-name" v-model="representativeFullName" placeholder="Иванова Мария Петровна" />
            </div>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div class="flex flex-col gap-2">
                <Label for="payer-email">Email для чека</Label>
                <Input id="payer-email" v-model="payerEmail" type="email" placeholder="mail@example.com" />
              </div>
              <div class="flex flex-col gap-2">
                <Label for="payer-phone">Телефон для чека</Label>
                <Input id="payer-phone" v-model="payerPhone" type="tel" placeholder="+7 999 123-45-67" />
              </div>
            </div>
            <p class="text-xs text-muted-foreground">Нужно хотя бы одно поле — email или телефон.</p>
          </div>

          <div class="flex items-center justify-between border-t pt-4">
            <span class="text-sm text-muted-foreground">К оплате</span>
            <span class="text-lg font-semibold">{{ formatMoney(finalAmount) }}</span>
          </div>
        </div>
      </template>

      <DialogFooter>
        <p v-if="submitError" class="mr-auto self-center text-sm text-red-500">{{ submitError }}</p>
        <Button variant="outline" @click="isDialogOpen = false">Отмена</Button>
        <Button v-if="data?.acquiringAvailable" :disabled="!canSubmit" :loading="isSubmitting" @click="submit">
          Оплатить {{ formatMoney(finalAmount) }}
        </Button>
      </DialogFooter>
    </DialogScrollContent>
  </Dialog>
</template>
