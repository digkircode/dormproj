<script setup lang="ts">
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { getScrollbarWidth } from '@/lib/utils'
import type { IndividualPassport } from '@/lib/individuals-api'

defineProps<{ passports: IndividualPassport[] }>()
const scrollbarWidth = getScrollbarWidth()

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
}

// table-fixed + явные ширины в % — иначе table-layout: auto пересчитывает ширину колонок
// по контенту, и она "прыгает" между вкладками (1 строка vs все). Общий colgroup под
// шапку и тело — сами таблицы разделены, чтобы скроллбар тела не тянулся мимо шапки
// (см. промпт проекта), а ширины остаются синхронными по позиции колонки.
</script>

<template>
  <div v-if="passports.length" class="overflow-hidden rounded-lg border">
    <div :style="{ paddingRight: `${scrollbarWidth}px` }">
    <table class="w-full table-fixed caption-bottom text-sm">
      <colgroup>
        <col class="w-[15%]" />
        <col class="w-[10%]" />
        <col class="w-[12%]" />
        <col class="w-[38%]" />
        <col class="w-[13%]" />
        <col class="w-[12%]" />
      </colgroup>
      <TableHeader class="bg-muted">
        <TableRow>
          <TableHead>Тип</TableHead>
          <TableHead>Серия</TableHead>
          <TableHead>Номер</TableHead>
          <TableHead>Кем выдан</TableHead>
          <TableHead>Дата выдачи</TableHead>
          <TableHead>Код подразделения</TableHead>
        </TableRow>
      </TableHeader>
    </table>
    </div>
    <div class="max-h-[65vh] overflow-y-scroll overflow-x-hidden">
      <table class="w-full table-fixed caption-bottom text-sm">
        <colgroup>
          <col class="w-[15%]" />
          <col class="w-[10%]" />
          <col class="w-[12%]" />
          <col class="w-[38%]" />
          <col class="w-[13%]" />
          <col class="w-[12%]" />
        </colgroup>
        <TableBody>
          <TableRow v-for="passport in passports" :key="passport.id">
            <TableCell>{{ passport.type }}</TableCell>
            <TableCell>{{ passport.series }}</TableCell>
            <TableCell>{{ passport.number }}</TableCell>
            <TableCell>{{ passport.unit }}</TableCell>
            <TableCell>{{ formatDate(passport.dateStart) }}</TableCell>
            <TableCell>{{ passport.codeUnit }}</TableCell>
          </TableRow>
        </TableBody>
      </table>
    </div>
  </div>
  <div v-else class="text-sm text-muted-foreground">Нет данных</div>
</template>
