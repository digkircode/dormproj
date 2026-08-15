<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import type { IndividualStudent } from '@/lib/individuals-api'

const props = defineProps<{ student: IndividualStudent }>()

const status = props.student.uchebStatus.toLowerCase()
const isGraduate = status.includes('выпуск')
const isOnLeave = status.includes('академ')

// Реальные значения UchebStatus из 1С на момент написания: "Является студентом",
// "Находится в академическом отпуске" — outline отличает отпуск и от активного
// обучения (default), и от выпуска (secondary), не будучи тревожным как destructive.
const statusVariant = isOnLeave ? 'outline' : isGraduate ? 'secondary' : 'default'
</script>

<template>
  <div class="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
    <div class="flex flex-col divide-y divide-border">
      <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
        <span class="text-muted-foreground">Статус</span>
        <Badge :variant="statusVariant">{{ student.uchebStatus }}</Badge>
      </div>
      <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
        <span class="text-muted-foreground">Курс</span>
        <span>{{ student.kurs }}</span>
      </div>
      <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
        <span class="text-muted-foreground">Группа</span>
        <span>{{ student.group }}</span>
      </div>
      <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
        <span class="text-muted-foreground">Форма обучения</span>
        <span>{{ student.formObuch }}</span>
      </div>
      <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
        <span class="text-muted-foreground">Основа</span>
        <span>{{ student.osnovaObuch }}</span>
      </div>
      <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
        <span class="text-muted-foreground">Учебный год</span>
        <span>{{ student.uchebYear }}</span>
      </div>
    </div>
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
      <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
        <span class="text-muted-foreground">ДОТ</span>
        <span>{{ student.dot ? 'Да' : 'Нет' }}</span>
      </div>
    </div>
  </div>
</template>
