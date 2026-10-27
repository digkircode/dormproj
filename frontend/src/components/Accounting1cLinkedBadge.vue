<script setup lang="ts">
import { Check, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

defineProps<{ linked: boolean }>()
const { t } = useI18n()
</script>

<template>
  <Tooltip>
    <TooltipTrigger as-child>
      <span class="inline-flex w-fit max-w-full items-center gap-1 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-normal text-muted-foreground">
        <component :is="linked ? Check : X" class="size-3.5 shrink-0" :class="linked ? 'text-emerald-500' : 'text-muted-foreground'" />
        <span class="min-w-0 truncate">{{ linked ? t('payment.accounting1c.linked') : t('payment.accounting1c.notLinked') }}</span>
      </span>
    </TooltipTrigger>
    <TooltipContent>{{ linked ? t('payment.accounting1c.linked') : t('payment.accounting1c.notLinked') }}</TooltipContent>
  </Tooltip>
</template>
