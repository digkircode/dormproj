<script setup lang="ts">
import EntityTable from '@/components/EntityTable.vue'
import { createAppColumnHelper } from '@/lib/table'
import { fetchFacetValues, fetchPassports, type Passport } from '@/lib/passport-api'

const columnLabels: Record<string, string> = {
  fullName: 'ФИО',
  period: 'Период',
  type: 'Тип',
  series: 'Серия',
  number: 'Номер',
  dateStart: 'Дата выдачи',
  unit: 'Кем выдан',
  codeUnit: 'Код подразделения',
  systemDoc: 'Системный номер',
}
const filterableFields = ['type', 'unit', 'codeUnit']

const DATE_COLUMNS = new Set(['period', 'dateStart'])

function cellText(columnId: string, value: unknown): string {
  if (DATE_COLUMNS.has(columnId) && typeof value === 'string') {
    const date = new Date(value)
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
  }
  return String(value ?? '')
}

const columnHelper = createAppColumnHelper<Passport>()

const columns = columnHelper.columns([
  columnHelper.accessor('fullName', { header: columnLabels.fullName, enableHiding: false, size: 224, minSize: 160 }),
  columnHelper.accessor('period', { header: columnLabels.period, size: 112, minSize: 100 }),
  columnHelper.accessor('type', { header: columnLabels.type, size: 144, minSize: 100 }),
  columnHelper.accessor('series', { header: columnLabels.series, size: 96, minSize: 80 }),
  columnHelper.accessor('number', { header: columnLabels.number, size: 112, minSize: 90 }),
  columnHelper.accessor('dateStart', { header: columnLabels.dateStart, size: 128, minSize: 100 }),
  columnHelper.accessor('unit', { header: columnLabels.unit, size: 288, minSize: 160 }),
  columnHelper.accessor('codeUnit', { header: columnLabels.codeUnit, size: 144, minSize: 100 }),
  columnHelper.accessor('systemDoc', { header: columnLabels.systemDoc, size: 144, minSize: 100 }),
])
</script>

<template>
  <div class="flex flex-1 flex-col p-4 md:p-6">
    <EntityTable
      :columns="columns"
      :column-labels="columnLabels"
      :filterable-fields="filterableFields"
      :default-sort="{ id: 'fullName', desc: false }"
      :fetch-page="fetchPassports"
      :fetch-facet-values="fetchFacetValues"
      :get-row-id="(p: Passport) => String(p.id)"
      total-label="паспортных записей"
      :cell-text="cellText"
    />
  </div>
</template>
