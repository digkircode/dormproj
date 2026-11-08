<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ContractListItem } from '@/lib/contracts-api'

defineProps<{ value: unknown; row: ContractListItem }>()
const { t } = useI18n()
</script>

<template>
  <div class="flex min-w-0 items-center gap-1.5">
    <span class="min-w-0 truncate" :title="String(value ?? '')">{{ value }}</span>
    <span v-if="row.matCapital === 'YES'" class="shrink-0 rounded border border-violet-200 bg-violet-50 px-1 py-0.5 text-[10px] font-semibold leading-none text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-300" :title="t('contracts.detail.matCapitalTitle')">{{ t('contracts.detail.matCapitalBadge') }}</span>
    <span
      v-if="row.benefit !== 'NONE'"
      class="shrink-0 rounded border px-1 py-0.5 text-[10px] font-semibold leading-none"
      :class="row.benefit === 'FREE'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300'
        : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300'"
      :title="t(`contracts.benefit.${row.benefit}`)"
    >{{ t(`contracts.benefit.${row.benefit}Short`) }}</span>
  </div>
</template>
