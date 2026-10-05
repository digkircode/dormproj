<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Skeleton } from '@/components/ui/skeleton'

const { t } = useI18n()
</script>

<template>
  <div class="w-full max-w-sm space-y-3 py-2" role="status" :aria-label="t('entityTable.loading')">
    <Skeleton class="h-4 w-3/4" />
    <Skeleton class="h-4 w-full" />
    <Skeleton class="h-4 w-1/2" />
    <span class="sr-only">{{ t('entityTable.loading') }}</span>
  </div>
</template>
