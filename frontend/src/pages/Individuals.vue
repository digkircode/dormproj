<script setup lang="ts">
import EntityTable from '@/components/EntityTable.vue'
import { createAppColumnHelper } from '@/lib/table'
import { fetchFacetValues, fetchIndividuals, type Individual } from '@/lib/individuals-api'

const columnLabels: Record<string, string> = {
  fullName: 'ФИО',
  code: 'Код',
  snils: 'СНИЛС',
  birthDate: 'Дата рождения',
  inn: 'ИНН',
  gender: 'Пол',
}
const filterableFields = ['gender']

function cellText(columnId: string, value: unknown): string {
  if (columnId === 'birthDate' && typeof value === 'string') {
    const date = new Date(value)
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
  }
  return String(value ?? '')
}

const columnHelper = createAppColumnHelper<Individual>()

const columns = columnHelper.columns([
  columnHelper.accessor('fullName', { header: columnLabels.fullName, enableHiding: false, size: 256, minSize: 160 }),
  columnHelper.accessor('code', { header: columnLabels.code, size: 128, minSize: 90 }),
  columnHelper.accessor('snils', { header: columnLabels.snils, size: 144, minSize: 100 }),
  columnHelper.accessor('birthDate', { header: columnLabels.birthDate, size: 128, minSize: 100 }),
  columnHelper.accessor('inn', { header: columnLabels.inn, size: 144, minSize: 100 }),
  columnHelper.accessor('gender', { header: columnLabels.gender, size: 96, minSize: 80 }),
])
</script>

<template>
  <div class="flex flex-1 flex-col p-4 md:p-6">
    <EntityTable
      :columns="columns"
      :column-labels="columnLabels"
      :filterable-fields="filterableFields"
      :default-sort="{ id: 'fullName', desc: false }"
      :fetch-page="fetchIndividuals"
      :fetch-facet-values="fetchFacetValues"
      :get-row-id="(i: Individual) => i.fizicheskoyeLitsoUid"
      total-label="физлиц"
      :cell-text="cellText"
    />
  </div>
</template>
