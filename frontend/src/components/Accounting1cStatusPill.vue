<script setup lang="ts">
import { Check, RotateCw, X } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { dateLocaleTag } from '@/lib/format-locale'
import type { Accounting1cSyncStatus } from '@/lib/contracts-api'

const props = defineProps<{
  status: Accounting1cSyncStatus
  documentUid?: string | null
  error?: string | null
  syncedAt?: string | null
  retrying?: boolean
}>()
const emit = defineEmits<{ retry: [] }>()

const { t } = useI18n()

const ICON = { NOT_SYNCED: RotateCw, SYNCED: Check, FAILED: X } as const
const ICON_CLASS: Record<Accounting1cSyncStatus, string> = {
  NOT_SYNCED: 'text-muted-foreground',
  SYNCED: 'text-emerald-500',
  FAILED: 'text-red-500',
}
const label = computed(() => t(`contracts.detail.accounting1c${props.status === 'NOT_SYNCED' ? 'NotSynced' : props.status === 'SYNCED' ? 'Synced' : 'Failed'}`))
// Тултип нативный (title), не Popover/Tooltip — эта ячейка живёт в обычной таблице
// страницы, не в модалке, но так проще и не тянет лишний Reka-портал ради одной строки
// текста (см. ловушку №10 про вложенные порталы — тут её нет, но и не нужно её заводить).
const titleText = computed(() => {
  if (props.status === 'FAILED' && props.error) return props.error
  if (props.status === 'SYNCED' && props.syncedAt) {
    return t('contracts.detail.accounting1cSyncedAt', { date: new Date(props.syncedAt).toLocaleString(dateLocaleTag()) })
  }
  return undefined
})
</script>

<template>
  <span class="inline-flex w-fit max-w-full items-center gap-1.5">
    <span
      class="inline-flex w-fit max-w-full items-center gap-1 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-normal text-muted-foreground"
      :title="titleText"
    >
      <component :is="ICON[status]" class="size-3.5 shrink-0" :class="ICON_CLASS[status]" />
      <span class="min-w-0 truncate">{{ label }}</span>
    </span>
    <Button
      v-if="status !== 'SYNCED'"
      variant="ghost"
      size="icon"
      class="size-6 shrink-0"
      :loading="retrying"
      :title="t('contracts.detail.accounting1cRetry')"
      @click="emit('retry')"
    >
      <RotateCw class="size-3.5" />
      <span class="sr-only">{{ t('contracts.detail.accounting1cRetry') }}</span>
    </Button>
  </span>
</template>
