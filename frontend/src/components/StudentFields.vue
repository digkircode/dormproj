<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import type { IndividualStudent } from '@/lib/individuals-api'

const props = defineProps<{ student: IndividualStudent }>()

const isGraduate = props.student.uchebStatus.toLowerCase().includes('выпуск')
</script>

<template>
  <div class="flex flex-col gap-4">
    <Badge :variant="isGraduate ? 'secondary' : 'default'" class="w-fit">{{ student.uchebStatus }}</Badge>

    <div class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
      <div>
        <div class="text-muted-foreground">Учебный план</div>
        <div>{{ student.uchebPlan }}</div>
      </div>
      <div>
        <div class="text-muted-foreground">Факультет</div>
        <div>{{ student.facultet }}</div>
      </div>
      <div>
        <div class="text-muted-foreground">Форма обучения</div>
        <div>{{ student.formObuch }}</div>
      </div>
      <div>
        <div class="text-muted-foreground">Уровень подготовки</div>
        <div>{{ student.urovenPodgotov }}</div>
      </div>
      <div>
        <div class="text-muted-foreground">Специальность</div>
        <div>{{ student.speciality }}</div>
      </div>
      <div>
        <div class="text-muted-foreground">Профиль (специализация)</div>
        <div>{{ student.profilSpec ?? '—' }}</div>
      </div>
      <div>
        <div class="text-muted-foreground">Курс</div>
        <div>{{ student.kurs }}</div>
      </div>
      <div>
        <div class="text-muted-foreground">Группа</div>
        <div>{{ student.group }}</div>
      </div>
      <div>
        <div class="text-muted-foreground">Основа</div>
        <div>{{ student.osnovaObuch }}</div>
      </div>
      <div>
        <div class="text-muted-foreground">Учебный год</div>
        <div>{{ student.uchebYear }}</div>
      </div>
      <div>
        <div class="text-muted-foreground">ДОТ</div>
        <div>{{ student.dot ? 'Да' : 'Нет' }}</div>
      </div>
    </div>
  </div>
</template>
