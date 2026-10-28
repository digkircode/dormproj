<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { AlertTriangle, ChevronDown, CreditCard, DoorOpen, Info, Loader } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import LoadingState from '@/components/LoadingState.vue'
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
import { STATUS_LABELS as CONTRACT_STATUS_LABELS } from '@/lib/contracts-format'
import { isValidEmailFormat, sanitizeLettersOnly } from '@/lib/utils'
import { dateLocaleTag } from '@/lib/format-locale'

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'

const { t } = useI18n()

const isDialogOpen = ref(false)
const isLoading = ref(true)
const loadError = ref('')
const data = ref<MyPaymentsData | null>(null)

const contracts = ref<MyContractSummary[]>([])
const selectedContractId = ref<number | undefined>(undefined)

function monthLabel(periodStart: string): string {
  return new Date(periodStart).toLocaleDateString(dateLocaleTag(), { month: 'long', year: 'numeric' })
}
function formatMoney(value: number): string {
  return `${value.toLocaleString(dateLocaleTag(), { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`
}

const selectedAccrualIds = ref<number[]>([])
const includePenalty = ref(true)

const openAccruals = computed<OpenAccrualRow[]>(() => data.value?.openAccruals ?? [])
const penaltyBalance = computed(() => data.value?.penaltyBalance ?? 0)

function toggleAccrual(id: number, checked: boolean) {
  selectedAccrualIds.value = checked ? [...selectedAccrualIds.value, id] : selectedAccrualIds.value.filter((v) => v !== id)
}

const accrualPickerOpen = ref(false)
const selectedAccrualsSummary = computed(() => {
  const selected = openAccruals.value.filter((a) => selectedAccrualIds.value.includes(a.id)).map((a) => monthLabel(a.periodStart))
  if (includePenalty.value && penaltyBalance.value > 0) selected.push(t('payment.createDialog.penaltyRowLabel'))
  return selected.join(', ') || t('payment.createDialog.noAccrualsSelected')
})

const selectedAmount = computed(() => {
  const accrualsTotal = openAccruals.value.filter((a) => selectedAccrualIds.value.includes(a.id)).reduce((sum, a) => sum + a.balance, 0)
  return accrualsTotal + (includePenalty.value ? penaltyBalance.value : 0)
})
const finalAmount = computed(() => selectedAmount.value)

const payerIsResident = ref(true)
const representativeFullName = ref('')
const payerEmail = ref('')
const submitAttempted = ref(false)
const emailInvalid = computed(() => submitAttempted.value && !isValidEmailFormat(payerEmail.value.trim()))
const representativeInvalid = computed(() => submitAttempted.value && !payerIsResident.value && !representativeFullName.value.trim())
const amountInvalid = computed(() => submitAttempted.value && finalAmount.value <= 0 && (openAccruals.value.length > 0 || penaltyBalance.value > 0))

const canSubmit = computed(() => {
  if (finalAmount.value <= 0) return false
  if (!payerIsResident.value && !representativeFullName.value.trim()) return false
  if (!isValidEmailFormat(payerEmail.value.trim())) return false
  return true
})

const isSubmitting = ref(false)
const submitError = ref('')

const isSwitching = ref(false)

async function loadPaymentsData(contractId: number | undefined, silent = false) {
  if (silent) isSwitching.value = true
  else isLoading.value = true
  loadError.value = ''
  try {
    data.value = await fetchMyPayments(contractId)
    selectedContractId.value = data.value.contract?.id
    const firstUnpaid = data.value.openAccruals[0]
    selectedAccrualIds.value = firstUnpaid ? [firstUnpaid.id] : []
    includePenalty.value = true
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
  if (id === selectedContractId.value) return
  submitAttempted.value = false
  await loadPaymentsData(id, true)
}

async function open(contractId?: number) {
  selectedAccrualIds.value = []
  includePenalty.value = true
  accrualPickerOpen.value = false
  payerIsResident.value = true
  representativeFullName.value = ''
  payerEmail.value = ''
  submitAttempted.value = false
  submitError.value = ''
  isDialogOpen.value = true

  const contractsPromise = fetchMyContracts().catch(() => [])
  await loadPaymentsData(contractId)
  contracts.value = await contractsPromise
}
defineExpose({ open })

async function submit() {
  if (isSubmitting.value) return
  submitAttempted.value = true
  if (!canSubmit.value) return
  isSubmitting.value = true
  submitError.value = ''
  try {
    const { paymentPageUrl } = await createPaymentIntent({
      contractId: selectedContractId.value,
      accrualIds: selectedAccrualIds.value,
      includePenalty: includePenalty.value,
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
      <LoadingState v-if="isLoading" class="min-h-64" />

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
                  № {{ c.number }} - {{ CONTRACT_STATUS_LABELS[c.status] }}
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
          <p class="text-sm font-medium">{{ t('payment.createDialog.amountSection') }}</p>
          <p class="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>{{ t('payment.createDialog.taxDeductionNotice') }}</span>
          </p>

          <p v-if="!openAccruals.length && penaltyBalance <= 0" class="text-sm text-muted-foreground">
            {{ t('payment.createDialog.noOpenAccruals') }}
          </p>
          <Collapsible v-else v-model:open="accrualPickerOpen">
            <CollapsibleTrigger as-child>
              <button
                type="button"
                :aria-invalid="amountInvalid"
                :class="['flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-md border px-3 text-sm hover:bg-accent', amountInvalid ? 'border-destructive' : '']"
              >
                <span class="min-w-0 truncate">{{ selectedAccrualsSummary }}</span>
                <span class="flex shrink-0 items-center gap-1.5">
                  <span class="font-medium">{{ formatMoney(selectedAmount) }}</span>
                  <ChevronDown class="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200" :class="accrualPickerOpen ? 'rotate-180' : ''" />
                </span>
              </button>
            </CollapsibleTrigger>
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
              <label
                v-if="penaltyBalance > 0"
                class="flex cursor-pointer items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm hover:bg-accent"
              >
                <span class="flex items-center gap-1.5">
                  <Checkbox :model-value="includePenalty" @update:model-value="(checked) => (includePenalty = !!checked)" />
                  {{ t('payment.createDialog.penaltyRowLabel') }}
                </span>
                <span class="font-medium">{{ formatMoney(penaltyBalance) }}</span>
              </label>
            </CollapsibleContent>
          </Collapsible>
          <p v-if="amountInvalid" class="text-xs text-destructive">{{ t('payment.createDialog.selectAmount') }}</p>
        </div>

        <div class="flex flex-col gap-3 rounded-lg border p-3">
          <p class="text-sm font-medium">{{ t('payment.createDialog.payerSection') }}</p>
          <div class="grid grid-cols-1 gap-1 rounded-md border bg-muted/30 p-1 sm:grid-cols-2" role="group" :aria-label="t('payment.createDialog.payerSection')">
            <Button class="h-auto min-h-9 w-full whitespace-normal px-2 py-1.5 text-center leading-snug" :variant="payerIsResident ? 'default' : 'ghost'" size="sm" :aria-pressed="payerIsResident" @click="payerIsResident = true">
              {{ t('payment.createDialog.payerIsResident') }}
            </Button>
            <Button class="h-auto min-h-9 w-full whitespace-normal px-2 py-1.5 text-center leading-snug" :variant="!payerIsResident ? 'default' : 'ghost'" size="sm" :aria-pressed="!payerIsResident" @click="payerIsResident = false">
              {{ t('payment.createDialog.payerIsOther') }}
            </Button>
          </div>
          <div v-if="!payerIsResident" class="flex flex-col gap-2">
            <Label for="representative-name">{{ t('payment.createDialog.representativeName') }}</Label>
            <Input
              id="representative-name"
              :model-value="representativeFullName"
              :aria-invalid="representativeInvalid"
              :aria-describedby="representativeInvalid ? 'representative-name-error' : undefined"
              @update:model-value="(v) => (representativeFullName = sanitizeLettersOnly(String(v)))"
            />
            <p v-if="representativeInvalid" id="representative-name-error" class="text-xs text-destructive">{{ t('payment.createDialog.representativeRequired') }}</p>
          </div>
          <div class="flex flex-col gap-2">
            <Label for="payer-email">{{ t('payment.createDialog.payerEmail') }}</Label>
            <Input id="payer-email" v-model="payerEmail" type="email" :aria-invalid="emailInvalid" :aria-describedby="emailInvalid ? 'payer-email-error' : undefined" />
            <p v-if="emailInvalid" id="payer-email-error" class="text-xs text-destructive">{{ t('payment.createDialog.invalidEmail') }}</p>
          </div>
        </div>

        <div class="flex flex-col gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <p class="flex items-start gap-1.5">
            <Info class="size-3.5 shrink-0 translate-y-0.5" />
            {{ t('payment.createDialog.certificateNotice') }}
          </p>
        </div>

        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-sm text-muted-foreground">{{ t('payment.createDialog.amountDue') }}</span>
            <span class="text-lg font-semibold">{{ formatMoney(finalAmount) }}</span>
          </div>
          <p v-if="includePenalty && penaltyBalance > 0" class="text-right text-xs text-muted-foreground">
            {{ t('payment.createDialog.includingPenalty', { amount: formatMoney(penaltyBalance) }) }}
          </p>
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
