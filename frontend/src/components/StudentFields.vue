<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { IndividualStudent } from '@/lib/individuals-api'

const { t } = useI18n()

defineProps<{ student: IndividualStudent }>()
</script>

<template>
  <div class="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
    <div class="flex flex-col divide-y divide-border">
      <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
        <span class="text-muted-foreground">{{ t('individuals.studentFields.facultet') }}</span>
        <span>{{ student.facultet }}</span>
      </div>
      <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
        <span class="text-muted-foreground">{{ t('individuals.studentFields.speciality') }}</span>
        <span>{{ student.speciality }}</span>
      </div>
      <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
        <span class="text-muted-foreground">{{ t('individuals.studentFields.formObuch') }}</span>
        <span>{{ student.formObuch }}</span>
      </div>
      <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
        <span class="text-muted-foreground">{{ t('individuals.studentFields.kurs') }}</span>
        <span>{{ student.kurs }}</span>
      </div>
    </div>
    <div class="flex flex-col divide-y divide-border">
      <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
        <span class="text-muted-foreground">{{ t('individuals.studentFields.urovenPodgotov') }}</span>
        <span>{{ student.urovenPodgotov }}</span>
      </div>
      <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
        <span class="text-muted-foreground">{{ t('individuals.studentFields.osnovaObuch') }}</span>
        <span>{{ student.osnovaObuch }}</span>
      </div>
      <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
        <span class="text-muted-foreground">{{ t('individuals.studentFields.group') }}</span>
        <span>{{ student.group }}</span>
      </div>
      <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
        <span class="text-muted-foreground">{{ t('individuals.studentFields.dot') }}</span>
        <span>{{ student.dot ? t('boolean.yes') : t('boolean.no') }}</span>
      </div>
    </div>
  </div>
</template>
