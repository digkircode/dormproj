<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Skeleton } from '@/components/ui/skeleton'

const { t } = useI18n()
</script>

<template>
  <div class="grid grid-cols-1 overflow-hidden rounded-md border sm:grid-cols-2" role="status" :aria-label="t('entityTable.loading')">
    <div
      v-for="index in 6"
      :key="index"
      class="flex items-center justify-between gap-2 px-3 py-2"
      :class="[index % 2 === 0 ? 'sm:border-l' : '', index > 1 ? 'border-t' : '', index === 2 ? 'sm:border-t-0' : '']"
      aria-hidden="true"
    >
      <Skeleton class="h-4 w-2/5" />
      <Skeleton class="h-4 w-1/4" />
    </div>
  </div>
</template>
