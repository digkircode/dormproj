<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Skeleton } from '@/components/ui/skeleton'

defineProps<{ count: number }>()
const { t } = useI18n()
</script>

<template>
  <div role="status" :aria-label="t('entityTable.loading')" class="contents">
    <div v-for="item in count" :key="item" class="flex min-h-10 items-center gap-3" aria-hidden="true">
      <Skeleton class="size-10 shrink-0 rounded-lg" />
      <div class="min-w-0 flex-1 space-y-1.5"><Skeleton class="h-3 w-3/4" /><Skeleton class="h-5 w-10" /></div>
    </div>
    <span class="sr-only">{{ t('entityTable.loading') }}</span>
  </div>
</template>
