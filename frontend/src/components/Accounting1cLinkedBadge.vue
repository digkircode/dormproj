<script setup lang="ts">
import { Check, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

// linked — известен ли 1С Бухгалтерии ContractorUID/ContractUID этого физлица/договора
// (Contract.accounting1cUid / Individual.accounting1cContractorUid), по прямой просьбе
// 2026-09-04 — не путать с Accounting1cStatusPill.vue (тот про статус отправки КОНКРЕТНОГО
// платежа, здесь — про саму сущность целиком, есть ли у неё вообще известная пара).
defineProps<{ linked: boolean }>()
const { t } = useI18n()
</script>

<template>
  <span
    class="inline-flex w-fit max-w-full items-center gap-1 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-normal text-muted-foreground"
    :title="linked ? t('payment.accounting1c.linked') : t('payment.accounting1c.notLinked')"
  >
    <component :is="linked ? Check : X" class="size-3.5 shrink-0" :class="linked ? 'text-emerald-500' : 'text-muted-foreground'" />
    <span class="min-w-0 truncate">{{ linked ? t('payment.accounting1c.linked') : t('payment.accounting1c.notLinked') }}</span>
  </span>
</template>
