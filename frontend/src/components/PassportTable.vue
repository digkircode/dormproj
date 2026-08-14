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
    <Table>
      <TableHeader class="bg-muted">
        <TableRow>
          <TableHead>Тип</TableHead>
          <TableHead>Серия и номер</TableHead>
          <TableHead>Дата выдачи</TableHead>
          <TableHead>Кем выдан</TableHead>
          <TableHead>Код подразделения</TableHead>
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
