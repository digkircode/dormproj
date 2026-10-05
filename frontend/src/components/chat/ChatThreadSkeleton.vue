<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Skeleton } from '@/components/ui/skeleton'

withDefaults(defineProps<{ header?: boolean }>(), { header: false })
const { t } = useI18n()
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col" role="status" :aria-label="t('entityTable.loading')">
    <div v-if="header" class="flex h-16 shrink-0 items-center gap-4 border-b px-3" aria-hidden="true">
      <Skeleton class="h-5 w-40" /><Skeleton class="h-5 w-24" />
    </div>
    <div class="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden p-4" aria-hidden="true">
      <div v-for="message in 5" :key="message" class="flex items-end gap-2" :class="message % 2 === 0 ? 'flex-row-reverse' : ''">
        <Skeleton class="size-10 shrink-0 rounded-full" />
        <div class="flex w-2/5 max-w-72 flex-col gap-2" :class="message % 2 === 0 ? 'items-end' : ''">
          <Skeleton class="h-3 w-1/2" />
          <Skeleton class="h-12 w-full rounded-2xl" />
        </div>
      </div>
    </div>
    <div class="shrink-0 border-t p-3" aria-hidden="true"><Skeleton class="h-16 w-full" /></div>
    <span class="sr-only">{{ t('entityTable.loading') }}</span>
  </div>
</template>
