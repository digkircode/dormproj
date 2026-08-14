<script setup lang="ts">
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import type { IndividualPassport } from '@/lib/individuals-api'

defineProps<{ passports: IndividualPassport[] }>()

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
}
</script>

<template>
  <div v-if="passports.length" class="overflow-hidden rounded-lg border">
    <!-- table-fixed + явные ширины в % — иначе table-layout: auto пересчитывает
         ширину колонок по контенту, и она "прыгает" между вкладками (1 строка vs все). -->
    <Table class="table-fixed">
      <TableHeader class="bg-muted">
        <TableRow>
          <TableHead class="w-[20%]">Тип</TableHead>
          <TableHead class="w-[15%]">Серия и номер</TableHead>
          <TableHead class="w-[15%]">Дата выдачи</TableHead>
          <TableHead class="w-[35%]">Кем выдан</TableHead>
          <TableHead class="w-[15%]">Код подразделения</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="passport in passports" :key="passport.id">
          <TableCell>{{ passport.type }}</TableCell>
          <TableCell>{{ passport.series }} {{ passport.number }}</TableCell>
          <TableCell>{{ formatDate(passport.dateStart) }}</TableCell>
          <TableCell>{{ passport.unit }}</TableCell>
          <TableCell>{{ passport.codeUnit }}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
  <div v-else class="text-sm text-muted-foreground">Нет данных</div>
</template>
