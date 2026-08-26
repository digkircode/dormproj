<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import type { IndividualPassport } from '@/lib/individuals-api'

const { t } = useI18n()

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
    <div class="[&>div]:max-h-[65vh]">
      <Table class="table-fixed">
        <TableHeader class="sticky top-0 z-10 bg-muted">
          <TableRow>
            <TableHead class="w-[15%]">{{ t('individuals.passportTable.colType') }}</TableHead>
            <TableHead class="w-[10%]">{{ t('individuals.passportTable.colSeries') }}</TableHead>
            <TableHead class="w-[12%]">{{ t('individuals.passportTable.colNumber') }}</TableHead>
            <TableHead class="w-[38%]">{{ t('individuals.passportTable.colIssuedBy') }}</TableHead>
            <TableHead class="w-[13%]">{{ t('individuals.passportTable.colIssuedAt') }}</TableHead>
            <TableHead class="w-[12%]">{{ t('individuals.passportTable.colIssuedCode') }}</TableHead>
          </TableRow>
        </TableHeader>
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
      </Table>
    </div>
  </div>
  <div v-else class="text-sm text-muted-foreground">{{ t('individuals.passportTable.noData') }}</div>
</template>
