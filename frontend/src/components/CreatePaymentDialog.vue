<script setup lang="ts">
import { computed, ref } from 'vue'
import { AlertTriangle, ChevronDown, CreditCard, Home, Percent } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  fetchMyPayments,
  createPaymentIntent,
  type MyPaymentsData,
  type OpenAccrualRow,
} from '@/lib/my-payments-api'
import { fetchMyContracts, type MyContractSummary } from '@/lib/contracts-api'
import { getContractDisplayStatus, STATUS_LABELS as CONTRACT_STATUS_LABELS } from '@/lib/contracts-format'
import { isValidEmailFormat } from '@/lib/utils'

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
// Та же маска, что и у "своей суммы" в CreateContractDialog.vue — прячет нативные
// стрелочки +/- у <input type="number"> (Chrome/Safari + Firefox).
const NO_SPINNER_CLASS = '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'

const isDialogOpen = ref(false)
const isLoading = ref(true)
const loadError = ref('')
const data = ref<MyPaymentsData | null>(null)

// Несколько договоров на одного проживающего одновременно — переключатель, тот же
// принцип, что и на карточке договора (MyContract.vue), добавлено 2026-08-25.
const contracts = ref<MyContractSummary[]>([])
const selectedContractId = ref<number | undefined>(undefined)

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

// Список начислений свёрнут по умолчанию — под выбором по умолчанию (последнее
// неоплаченное, см. open()) обычно ничего менять не нужно, полный чек-лист занимает
// место зря (по прямой просьбе 2026-08-25). Разворачивается по клику на сводку.
const accrualPickerOpen = ref(false)
const selectedAccrualsSummary = computed(() => {
  const selected = openAccruals.value.filter((a) => selectedAccrualIds.value.includes(a.id))
  const monthsLabel = selected.map((a) => monthLabel(a.periodStart)).join(', ')
  if (!monthsLabel) return includePenalty.value ? 'Пеня' : 'Начисления не выбраны'
  return includePenalty.value ? `${monthsLabel} и пеня` : monthsLabel
})

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
// Красная рамка у email — только после первой попытки отправить (тот же приём, что
// submitAttempted/computedInvalid в CreateIndividualDialog.vue), чтобы не встречать
// пользователя ошибкой на ещё не тронутой форме.
const submitAttempted = ref(false)
const emailInvalid = computed(() => submitAttempted.value && !isValidEmailFormat(payerEmail.value.trim()))

const canSubmit = computed(() => {
  if (finalAmount.value <= 0) return false
  if (!payerIsResident.value && !representativeFullName.value.trim()) return false
  if (!isValidEmailFormat(payerEmail.value.trim())) return false
  return true
})

const isSubmitting = ref(false)
const submitError = ref('')

// Начисления сортируются от самого раннего к самому позднему (см. GET /my-payments) —
// по умолчанию выбирается ПЕРВОЕ непогашенное (не последнее — по прямой просьбе
// 2026-08-25, платёж должен закрывать долг по порядку, как и реальная разноска FIFO,
// см. allocatePaymentFifo). Остаток по нему уже учитывает частичные платежи (balance =
// total - сумма allocations, см. serializeAccrual) — не полную стоимость комнаты.
async function loadPaymentsData(contractId: number | undefined) {
  isLoading.value = true
  loadError.value = ''
  try {
    data.value = await fetchMyPayments(contractId)
    selectedContractId.value = data.value.contract?.id
    const firstUnpaid = data.value.openAccruals[0]
    selectedAccrualIds.value = firstUnpaid ? [firstUnpaid.id] : []
    includePenalty.value = false
    accrualPickerOpen.value = false
    payerEmail.value = data.value.payerEmail ?? ''
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isLoading.value = false
  }
}

async function switchContract(id: number) {
  await loadPaymentsData(id)
}

async function open(contractId?: number) {
  amountMode.value = 'select'
  selectedAccrualIds.value = []
  includePenalty.value = false
  accrualPickerOpen.value = false
  customAmount.value = undefined
  payerIsResident.value = true
  representativeFullName.value = ''
  payerEmail.value = ''
  submitAttempted.value = false
  submitError.value = ''
  isDialogOpen.value = true

  await loadPaymentsData(contractId)
  try {
    contracts.value = await fetchMyContracts()
  } catch {
    // Переключатель просто не появится — сама форма уже загружена выше и от списка
    // не зависит (тот же принцип, что и в MyContract.vue).
  }
}
defineExpose({ open })

async function submit() {
  submitAttempted.value = true
  if (!canSubmit.value) return
  isSubmitting.value = true
  submitError.value = ''
  try {
    const { paymentPageUrl } = await createPaymentIntent({
      contractId: selectedContractId.value,
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
</script>

<template>
  <Dialog :open="isDialogOpen" @update:open="(open) => (isDialogOpen = open)">
    <DialogScrollContent :class="['flex flex-col gap-5 sm:max-w-lg', DIALOG_ANIMATE_CLASS]">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-1.5">
          <CreditCard class="size-4 text-primary" />
          Новый платёж
        </DialogTitle>
      </DialogHeader>

      <p v-if="loadError" class="text-sm text-red-500">{{ loadError }}</p>
      <p v-if="isLoading" class="text-sm text-muted-foreground">Загрузка…</p>

      <template v-if="!isLoading && !loadError && data?.contract">
        <div class="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
          <div class="flex items-center justify-between gap-2">
            <DropdownMenu v-if="contracts.length > 1">
              <DropdownMenuTrigger as-child>
                <button type="button" class="flex items-center gap-1 text-sm font-medium hover:text-primary">
                  Договор № {{ data.contract.number }}
                  <ChevronDown class="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  v-for="c in contracts"
                  :key="c.id"
                  :class="c.id === selectedContractId ? 'font-medium' : ''"
                  @click="switchContract(c.id)"
                >
                  № {{ c.number }} — {{ CONTRACT_STATUS_LABELS[getContractDisplayStatus(c.status, c.endDate)] }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <span v-else class="text-sm font-medium">Договор № {{ data.contract.number }}</span>
            <span v-if="data.contract.roomNumber" class="flex items-center gap-1 text-sm text-muted-foreground">
              <Home class="size-3.5 shrink-0" />
              Комната {{ data.contract.roomNumber }}
            </span>
          </div>
          <p class="text-sm text-muted-foreground">{{ data.contract.residentFullName }}</p>
        </div>

        <div class="flex flex-col gap-3 rounded-lg border p-3">
          <p class="text-sm font-medium">Сумма</p>
          <div class="flex w-fit items-center gap-1 rounded-md border p-0.5">
            <Button :variant="amountMode === 'select' ? 'default' : 'ghost'" size="sm" @click="amountMode = 'select'">
              Выбрать начисления
            </Button>
            <Button :variant="amountMode === 'custom' ? 'default' : 'ghost'" size="sm" @click="amountMode = 'custom'"> Своя сумма </Button>
          </div>

          <template v-if="amountMode === 'select'">
            <p v-if="!openAccruals.length" class="text-sm text-muted-foreground">Непогашенных начислений нет.</p>
            <Collapsible v-else v-model:open="accrualPickerOpen">
              <CollapsibleTrigger as-child>
                <button
                  type="button"
                  class="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm hover:bg-accent"
                >
                  <span>{{ selectedAccrualsSummary }}</span>
                  <span class="flex items-center gap-1.5">
                    <span class="font-medium">{{ formatMoney(selectedAmount) }}</span>
                    <ChevronDown class="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200" :class="accrualPickerOpen ? 'rotate-180' : ''" />
                  </span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent class="flex flex-col gap-1 pt-1">
                <label
                  v-for="accrual in openAccruals"
                  :key="accrual.id"
                  class="flex cursor-pointer items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm hover:bg-accent"
                >
                  <span class="flex items-center gap-1.5">
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
                  class="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm"
                  :class="canSelectPenalty ? 'cursor-pointer hover:bg-accent' : 'cursor-not-allowed opacity-50'"
                  :title="canSelectPenalty ? '' : 'Сначала выберите все открытые начисления — иначе платёж сначала погасит их'"
                >
                  <span class="flex items-center gap-1.5">
                    <Checkbox :model-value="includePenalty" :disabled="!canSelectPenalty" @update:model-value="(v) => (includePenalty = !!v)" />
                    <Percent class="size-3.5 text-orange-500" />
                    Пеня целиком
                  </span>
                  <span class="font-medium">{{ formatMoney(penaltyBalance) }}</span>
                </label>
              </CollapsibleContent>
            </Collapsible>
          </template>
          <template v-else>
            <div class="flex flex-col gap-2">
              <Label for="custom-amount">Сумма</Label>
              <Input :class="NO_SPINNER_CLASS" id="custom-amount" v-model.number="customAmount" type="number" min="1" />
            </div>
          </template>
        </div>

        <div class="flex flex-col gap-3 rounded-lg border p-3">
          <p class="text-sm font-medium">Плательщик</p>
          <div class="flex w-fit items-center gap-1 rounded-md border p-0.5">
            <Button :variant="payerIsResident ? 'default' : 'ghost'" size="sm" @click="payerIsResident = true"> Оплачиваю сам(а) </Button>
            <Button :variant="!payerIsResident ? 'default' : 'ghost'" size="sm" @click="payerIsResident = false"> Оплачивает другой человек </Button>
          </div>
          <div v-if="!payerIsResident" class="flex flex-col gap-2">
            <Label for="representative-name">ФИО плательщика</Label>
            <Input id="representative-name" v-model="representativeFullName" />
          </div>
          <div class="flex flex-col gap-2">
            <Label for="payer-email">Email для чека</Label>
            <Input id="payer-email" v-model="payerEmail" type="email" :class="emailInvalid ? 'border-red-500' : ''" />
            <p v-if="emailInvalid" class="text-xs text-red-500">Некорректный email</p>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-sm text-muted-foreground">К оплате</span>
            <span class="text-lg font-semibold">{{ formatMoney(finalAmount) }}</span>
          </div>
          <p v-if="!data.acquiringAvailable" class="flex items-center gap-1.5 text-xs text-muted-foreground">
            <AlertTriangle class="size-3.5 shrink-0 text-orange-500" />
            Оплата картой временно недоступна — эквайринг ещё не подключён.
          </p>
        </div>
      </template>

      <DialogFooter>
        <p v-if="submitError" class="mr-auto self-center text-sm text-red-500">{{ submitError }}</p>
        <Button variant="outline" @click="isDialogOpen = false">Отмена</Button>
        <Button :disabled="!data?.acquiringAvailable" :loading="isSubmitting" @click="submit">
          Оплатить {{ formatMoney(finalAmount) }}
        </Button>
      </DialogFooter>
    </DialogScrollContent>
  </Dialog>
</template>
