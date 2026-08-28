<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { AlertTriangle, ChevronDown, CreditCard, DoorOpen, HelpCircle, Info, Loader, Percent } from 'lucide-vue-next'
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
import { isValidEmailFormat, sanitizeLettersOnly } from '@/lib/utils'
import { dateLocaleTag } from '@/lib/format-locale'

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
// Та же маска, что и у "своей суммы" в CreateContractDialog.vue — прячет нативные
// стрелочки +/- у <input type="number"> (Chrome/Safari + Firefox).
const NO_SPINNER_CLASS = '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'

const { t } = useI18n()

const isDialogOpen = ref(false)
const isLoading = ref(true)
const loadError = ref('')
const data = ref<MyPaymentsData | null>(null)

// Несколько договоров на одного проживающего одновременно — переключатель, тот же
// принцип, что и на карточке договора (MyContract.vue), добавлено 2026-08-25.
const contracts = ref<MyContractSummary[]>([])
const selectedContractId = ref<number | undefined>(undefined)

function monthLabel(periodStart: string): string {
  return new Date(periodStart).toLocaleDateString(dateLocaleTag(), { month: 'long', year: 'numeric' })
}
function formatMoney(value: number): string {
  return `${value.toLocaleString(dateLocaleTag(), { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`
}

// --- Форма создания платежа — та же логика, что была на отдельной странице /student/payment
// (см. историю MyPayment.vue), перенесена в модалку по прямой просьбе 2026-08-25: кнопка
// "Оплатить" на карточке договора больше никуда не переходит, а сразу открывает эту форму. ---
// Пеня — всегда отдельным платежом (по прямой просьбе 2026-08-27), не сочетается ни с
// выбором начислений, ни со своей суммой — свой собственный третий режим (см. ниже), а
// не чекбокс внутри "Выбрать начисления". Раньше пеню можно было включить в общий платёж,
// только если этим же платежом закрывались ВСЕ открытые начисления (иначе деньги по FIFO
// ушли бы сначала на начисления, см. allocatePaymentFifo) — теперь бэк для penaltyOnly-
// платежей вообще не пропускает сумму через FIFO (см. my-payments.controller.ts), поэтому
// пеню можно оплатить в любой момент независимо от того, сколько ещё открытых начислений.
type AmountMode = 'select' | 'custom' | 'penalty'
const amountMode = ref<AmountMode>('select')
const selectedAccrualIds = ref<number[]>([])
const customAmount = ref<number | undefined>(undefined)
// Своя (в т.ч. частичная) сумма в режиме "Пеня" — по умолчанию подставляется полный
// остаток пени (см. selectPenaltyMode), можно уменьшить вручную.
const penaltyAmount = ref<number | undefined>(undefined)

const openAccruals = computed<OpenAccrualRow[]>(() => data.value?.openAccruals ?? [])
const penaltyBalance = computed(() => data.value?.penaltyBalance ?? 0)

function toggleAccrual(id: number, checked: boolean) {
  selectedAccrualIds.value = checked ? [...selectedAccrualIds.value, id] : selectedAccrualIds.value.filter((v) => v !== id)
}

function selectPenaltyMode() {
  amountMode.value = 'penalty'
  if (penaltyAmount.value == null) penaltyAmount.value = penaltyBalance.value
}

// Компактная подсказка "как это работает" (пеня отдельным платежом, своя сумма
// разносится по FIFO) — по прямой просьбе 2026-08-28, после того как на телефоне
// это оказалось неочевидно. НЕ Popover/Tooltip (оба — Reka-портал) — этот диалог
// уже несёт один портал (DropdownMenu переключателя договора), второй вложенный
// модальный Reka-портал здесь уже ловил ловушку №10 (см. историю правок ниже про
// голый <select> вместо Select) — вместо портала простой локальный toggle, текст
// рендерится в обычном потоке DOM.
const showAmountHelp = ref(false)

// Список начислений свёрнут по умолчанию — под выбором по умолчанию (последнее
// неоплаченное, см. open()) обычно ничего менять не нужно, полный чек-лист занимает
// место зря (по прямой просьбе 2026-08-25). Разворачивается по клику на сводку.
const accrualPickerOpen = ref(false)
const selectedAccrualsSummary = computed(() => {
  const selected = openAccruals.value.filter((a) => selectedAccrualIds.value.includes(a.id))
  return selected.map((a) => monthLabel(a.periodStart)).join(', ') || t('payment.createDialog.noAccrualsSelected')
})

const selectedAmount = computed(() =>
  openAccruals.value.filter((a) => selectedAccrualIds.value.includes(a.id)).reduce((sum, a) => sum + a.balance, 0),
)
const finalAmount = computed(() => {
  if (amountMode.value === 'penalty') return penaltyAmount.value ?? 0
  if (amountMode.value === 'custom') return customAmount.value ?? 0
  return selectedAmount.value
})

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

// silent — переключение договора уже открытой формы (см. switchContract): не прячем
// текущие данные под "Загрузка…", просто приглушаем блок опacity, пока не придут новые
// (было резко/дёргано — по прямой просьбе 2026-08-26), тот же приём, что в MyContract.vue.
const isSwitching = ref(false)

// Начисления сортируются от самого раннего к самому позднему (см. GET /my-payments) —
// по умолчанию выбирается ПЕРВОЕ непогашенное (не последнее — по прямой просьбе
// 2026-08-25, платёж должен закрывать долг по порядку, как и реальная разноска FIFO,
// см. allocatePaymentFifo). Остаток по нему уже учитывает частичные платежи (balance =
// total - сумма allocations, см. serializeAccrual) — не полную стоимость комнаты.
async function loadPaymentsData(contractId: number | undefined, silent = false) {
  if (silent) isSwitching.value = true
  else isLoading.value = true
  loadError.value = ''
  try {
    data.value = await fetchMyPayments(contractId)
    selectedContractId.value = data.value.contract?.id
    const firstUnpaid = data.value.openAccruals[0]
    selectedAccrualIds.value = firstUnpaid ? [firstUnpaid.id] : []
    accrualPickerOpen.value = false
    payerEmail.value = data.value.payerEmail ?? ''
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isLoading.value = false
    isSwitching.value = false
  }
}

async function switchContract(id: number) {
  // Клик по уже выбранному договору — не перезагружать (та же логика, что в MyContract.vue).
  if (id === selectedContractId.value) return
  await loadPaymentsData(id, true)
}

async function open(contractId?: number) {
  amountMode.value = 'select'
  selectedAccrualIds.value = []
  accrualPickerOpen.value = false
  customAmount.value = undefined
  penaltyAmount.value = undefined
  payerIsResident.value = true
  representativeFullName.value = ''
  payerEmail.value = ''
  submitAttempted.value = false
  submitError.value = ''
  isDialogOpen.value = true

  // Список договоров грузим параллельно с основными данными, не после — та же причина,
  // что и в MyContract.vue (иначе переключатель на пару кадров дорисовывается позже,
  // видимый "скачок" чипа с обычного текста на кнопку со стрелкой).
  const contractsPromise = fetchMyContracts().catch(() => [])
  await loadPaymentsData(contractId)
  // Переключатель просто не появится при ошибке (contractsPromise проглатывает её выше) —
  // сама форма уже загружена и от списка не зависит (тот же принцип, что в MyContract.vue).
  contracts.value = await contractsPromise
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
      penaltyOnly: amountMode.value === 'penalty',
      customAmount:
        amountMode.value === 'custom' ? (customAmount.value ?? null) : amountMode.value === 'penalty' ? (penaltyAmount.value ?? null) : null,
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
          {{ t('payment.createDialog.title') }}
        </DialogTitle>
      </DialogHeader>

      <p v-if="loadError" class="text-sm text-red-500">{{ loadError }}</p>
      <p v-if="isLoading" class="text-sm text-muted-foreground">{{ t('entityTable.loading') }}</p>

      <div v-if="!isLoading && !loadError && data?.contract" class="flex flex-col gap-5 transition-opacity duration-200" :class="isSwitching ? 'opacity-50' : ''">
        <div class="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
          <div class="flex items-center justify-between gap-2">
            <DropdownMenu v-if="contracts.length > 1">
              <DropdownMenuTrigger as-child>
                <button
                  type="button"
                  class="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-sm font-medium hover:bg-accent"
                >
                  {{ t('payment.createDialog.contractNumber', { number: data.contract.number }) }}
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
            <span v-else class="text-sm font-medium">{{ t('payment.createDialog.contractNumber', { number: data.contract.number }) }}</span>
            <Loader v-if="isSwitching" class="size-3.5 shrink-0 animate-spin text-muted-foreground" />
            <span v-if="data.contract.roomNumber" class="flex items-center gap-1 text-sm text-muted-foreground">
              <DoorOpen class="size-3.5 shrink-0" />
              {{ t('payment.createDialog.room', { room: data.contract.roomNumber }) }}
            </span>
          </div>
          <p class="text-sm text-muted-foreground">{{ data.contract.residentFullName }}</p>
        </div>

        <div class="flex flex-col gap-3 rounded-lg border p-3">
          <div class="flex items-center gap-1">
            <p class="text-sm font-medium">{{ t('payment.createDialog.amountSection') }}</p>
            <button
              type="button"
              :title="t('payment.createDialog.howItWorksLabel')"
              class="rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-primary"
              @click="showAmountHelp = !showAmountHelp"
            >
              <HelpCircle class="size-3.5" />
              <span class="sr-only">{{ t('payment.createDialog.howItWorksLabel') }}</span>
            </button>
          </div>
          <p v-if="showAmountHelp" class="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
            {{ t('payment.createDialog.howItWorksText') }}
          </p>
          <!-- flex-wrap (без w-fit — тот сжимал бы box к содержимому и мешал переносу) —
               3 подписанные кнопки ("Выбрать начисления"/"Своя сумма"/"Пеня") не помещались
               в одну строку на узком телефоне. -->
          <div class="flex flex-wrap items-center gap-1 rounded-md border p-0.5">
            <Button :variant="amountMode === 'select' ? 'default' : 'ghost'" size="sm" @click="amountMode = 'select'">
              {{ t('payment.createDialog.chooseAccruals') }}
            </Button>
            <Button :variant="amountMode === 'custom' ? 'default' : 'ghost'" size="sm" @click="amountMode = 'custom'">
              {{ t('payment.createDialog.customAmount') }}
            </Button>
            <!-- Пеня — свой отдельный режим, не чекбокс внутри "Выбрать начисления" (по
                 прямой просьбе 2026-08-27) — платится всегда отдельным платежом, независимо
                 от того, сколько ещё открытых начислений на договоре, см. selectPenaltyMode. -->
            <Button v-if="penaltyBalance > 0" :variant="amountMode === 'penalty' ? 'default' : 'ghost'" size="sm" @click="selectPenaltyMode">
              <Percent class="size-3.5 shrink-0" />
              {{ t('payment.createDialog.penaltyMode') }}
            </Button>
          </div>

          <template v-if="amountMode === 'select'">
            <p v-if="!openAccruals.length" class="text-sm text-muted-foreground">{{ t('payment.createDialog.noOpenAccruals') }}</p>
            <Collapsible v-else v-model:open="accrualPickerOpen">
              <CollapsibleTrigger as-child>
                <button
                  type="button"
                  class="flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-md border px-3 text-sm hover:bg-accent"
                >
                  <span>{{ selectedAccrualsSummary }}</span>
                  <span class="flex items-center gap-1.5">
                    <span class="font-medium">{{ formatMoney(selectedAmount) }}</span>
                    <ChevronDown class="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200" :class="accrualPickerOpen ? 'rotate-180' : ''" />
                  </span>
                </button>
              </CollapsibleTrigger>
              <!-- max-h + overflow-y-auto — при большом числе начислений список раньше рос
                   безгранично внутри и без того скроллящейся модалки (DialogScrollContent
                   max-h-[80vh]), из-за чего в нём было легко потерять кнопку "Оплатить"
                   далеко внизу; теперь длинный список скроллится сам в своих границах. -->
              <CollapsibleContent class="flex max-h-56 flex-col gap-1 overflow-y-auto pt-1">
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
              </CollapsibleContent>
            </Collapsible>
          </template>
          <template v-else-if="amountMode === 'custom'">
            <Input
              :class="NO_SPINNER_CLASS"
              id="custom-amount"
              v-model.number="customAmount"
              type="number"
              min="1"
              :placeholder="t('payment.createDialog.amountPlaceholder')"
            />
          </template>
          <template v-else>
            <Input
              :class="NO_SPINNER_CLASS"
              id="penalty-amount"
              v-model.number="penaltyAmount"
              type="number"
              min="1"
              :max="penaltyBalance"
              :placeholder="t('payment.createDialog.amountPlaceholder')"
            />
            <p class="text-xs text-muted-foreground">{{ t('payment.createDialog.penaltyModeHint', { amount: formatMoney(penaltyBalance) }) }}</p>
          </template>
        </div>

        <div class="flex flex-col gap-3 rounded-lg border p-3">
          <p class="text-sm font-medium">{{ t('payment.createDialog.payerSection') }}</p>
          <div class="flex flex-wrap items-center gap-1 rounded-md border p-0.5">
            <Button :variant="payerIsResident ? 'default' : 'ghost'" size="sm" @click="payerIsResident = true">
              {{ t('payment.createDialog.payerIsResident') }}
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
            />
          </div>
          <div class="flex flex-col gap-2">
            <Label for="payer-email">{{ t('payment.createDialog.payerEmail') }}</Label>
            <Input id="payer-email" v-model="payerEmail" type="email" :class="emailInvalid ? 'border-red-500' : ''" />
            <p v-if="emailInvalid" class="text-xs text-red-500">{{ t('payment.createDialog.invalidEmail') }}</p>
          </div>
        </div>

        <div class="flex flex-col gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <p class="flex items-start gap-1.5">
            <Info class="size-3.5 shrink-0 translate-y-0.5" />
            {{ t('payment.createDialog.certificateNotice') }}
          </p>
          <p class="flex items-start gap-1.5">
            <Info class="size-3.5 shrink-0 translate-y-0.5" />
            {{ t('payment.createDialog.taxDeductionNotice') }}
          </p>
        </div>

        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-sm text-muted-foreground">{{ t('payment.createDialog.amountDue') }}</span>
            <span class="text-lg font-semibold">{{ formatMoney(finalAmount) }}</span>
          </div>
          <p v-if="!data.acquiringAvailable" class="flex items-center gap-1.5 text-xs text-muted-foreground">
            <AlertTriangle class="size-3.5 shrink-0 text-orange-500" />
            {{ t('payment.createDialog.acquiringUnavailable') }}
          </p>
        </div>
      </div>

      <DialogFooter>
        <p v-if="submitError" class="mr-auto self-center text-sm text-red-500">{{ submitError }}</p>
        <Button variant="outline" @click="isDialogOpen = false">{{ t('payment.createDialog.cancel') }}</Button>
        <Button :disabled="!data?.acquiringAvailable" :loading="isSubmitting" @click="submit">
          {{ t('payment.createDialog.pay', { amount: formatMoney(finalAmount) }) }}
        </Button>
      </DialogFooter>
    </DialogScrollContent>
  </Dialog>
</template>
