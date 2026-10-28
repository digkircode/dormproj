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
  </div>
</template>
