<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { dateLocaleTag } from '@/lib/format-locale'

// row.isCurrent — самый свежий периодStart среди уже посчитанных документов (см.
// ServiceProvisionDocuments.vue), не обязательно "прямо сейчас идущий" месяц — это
// последний ЗАКОНЧИВШИЙСЯ месяц, за который вообще есть подсчёт (тот же месяц, что
// считает computeAndSave() на бэке по умолчанию).
defineProps<{ value: unknown; row: { isCurrent: boolean } }>()
const { t } = useI18n()

function formatPeriod(value: unknown): string {
  if (typeof value !== 'string') return String(value ?? '—')
  return new Date(value).toLocaleDateString(dateLocaleTag(), { month: 'long', year: 'numeric' })
}
</script>

<template>
  <span class="inline-flex items-center gap-1.5">
    <span>{{ formatPeriod(value) }}</span>
    <span
      v-if="row.isCurrent"
      class="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[11px] leading-none font-medium text-primary"
    >
      {{ t('serviceProvisionDocuments.currentPeriod') }}
    </span>
  </span>
</template>
