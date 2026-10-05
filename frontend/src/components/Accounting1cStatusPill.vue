<script setup lang="ts">
import { Check, RotateCw, X } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { dateLocaleTag } from '@/lib/format-locale'
import type { Accounting1cSyncStatus } from '@/lib/contracts-api'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const props = defineProps<{
  status: Accounting1cSyncStatus
  documentUid?: string | null
  error?: string | null
  syncedAt?: string | null
  retrying?: boolean
}>()

const { t } = useI18n()

const ICON = { NOT_SYNCED: RotateCw, SYNCED: Check, FAILED: X } as const
const ICON_CLASS: Record<Accounting1cSyncStatus, string> = {
  NOT_SYNCED: 'text-muted-foreground',
  SYNCED: 'text-emerald-500',
  FAILED: 'text-red-500',
}
const label = computed(() => t(`contracts.detail.accounting1c${props.status === 'NOT_SYNCED' ? 'NotSynced' : props.status === 'SYNCED' ? 'Synced' : 'Failed'}`))
const titleText = computed(() => {
  if (props.status === 'FAILED' && props.error) return props.error
  if (props.status === 'SYNCED' && props.syncedAt) {
    return t('contracts.detail.accounting1cSyncedAt', { date: new Date(props.syncedAt).toLocaleString(dateLocaleTag()) })
  }
  return undefined
})
</script>

<template>
  <Tooltip>
    <TooltipTrigger as-child>
      <span class="inline-flex w-fit max-w-full items-center gap-1 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-normal text-muted-foreground">
        <component :is="ICON[status]" class="size-3.5 shrink-0" :class="ICON_CLASS[status]" />
        <span class="min-w-0 truncate">{{ label }}</span>
      </span>
    </TooltipTrigger>
    <TooltipContent v-if="titleText">{{ titleText }}</TooltipContent>
  </Tooltip>
</template>
