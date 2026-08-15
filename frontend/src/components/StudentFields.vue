<script setup lang="ts">
import type { IndividualStudent } from '@/lib/individuals-api'

defineProps<{ student: IndividualStudent }>()
</script>

<template>
  <div class="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
    <div class="flex flex-col divide-y divide-border">
      <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
        <span class="text-muted-foreground">Факультет</span>
        <span>{{ student.facultet }}</span>
      </div>
      <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
        <span class="text-muted-foreground">Специальность</span>
        <span>{{ student.speciality }}</span>
      </div>
      <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
        <span class="text-muted-foreground">Форма обучения</span>
        <span>{{ student.formObuch }}</span>
      </div>
      <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
        <span class="text-muted-foreground">Курс</span>
        <span>{{ student.kurs }}</span>
      </div>
    </div>
    <div class="flex flex-col divide-y divide-border">
      <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
        <span class="text-muted-foreground">Уровень подготовки</span>
        <span>{{ student.urovenPodgotov }}</span>
      </div>
      <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
        <span class="text-muted-foreground">Основа</span>
        <span>{{ student.osnovaObuch }}</span>
      </div>
      <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
        <span class="text-muted-foreground">Группа</span>
        <span>{{ student.group }}</span>
      </div>
      <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
        <span class="text-muted-foreground">ДОТ</span>
        <span>{{ student.dot ? 'Да' : 'Нет' }}</span>
      </div>
    </div>
  </div>
</template>
