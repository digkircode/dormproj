<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import type { IndividualStudent } from '@/lib/individuals-api'

const props = defineProps<{ student: IndividualStudent }>()

const isGraduate = props.student.uchebStatus.toLowerCase().includes('выпуск')
</script>

<template>
  <div class="flex flex-col gap-4">
    <Badge :variant="isGraduate ? 'secondary' : 'default'" class="w-fit">{{ student.uchebStatus }}</Badge>

    <div class="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
      <div class="flex flex-col divide-y divide-border">
        <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
          <span class="text-muted-foreground">Учебный план</span>
          <span>{{ student.uchebPlan }}</span>
        </div>
        <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
          <span class="text-muted-foreground">Факультет</span>
          <span>{{ student.facultet }}</span>
        </div>
        <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
          <span class="text-muted-foreground">Форма обучения</span>
          <span>{{ student.formObuch }}</span>
        </div>
        <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
          <span class="text-muted-foreground">Уровень подготовки</span>
          <span>{{ student.urovenPodgotov }}</span>
        </div>
        <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
          <span class="text-muted-foreground">Специальность</span>
          <span>{{ student.speciality }}</span>
        </div>
        <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
          <span class="text-muted-foreground">Профиль (специализация)</span>
          <span>{{ student.profilSpec ?? '—' }}</span>
        </div>
      </div>
      <div class="flex flex-col divide-y divide-border">
        <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
          <span class="text-muted-foreground">Курс</span>
          <span>{{ student.kurs }}</span>
        </div>
        <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
          <span class="text-muted-foreground">Группа</span>
          <span>{{ student.group }}</span>
        </div>
        <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
          <span class="text-muted-foreground">Основа</span>
          <span>{{ student.osnovaObuch }}</span>
        </div>
        <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
          <span class="text-muted-foreground">Учебный год</span>
          <span>{{ student.uchebYear }}</span>
        </div>
        <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
          <span class="text-muted-foreground">ДОТ</span>
          <span>{{ student.dot ? 'Да' : 'Нет' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
