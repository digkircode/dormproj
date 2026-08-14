<script setup lang="ts">
import EntityTable from '@/components/EntityTable.vue'
import { createAppColumnHelper } from '@/lib/table'
import { fetchFacetValues, fetchCitizenship, type Citizenship } from '@/lib/citizenship-api'

const columnLabels: Record<string, string> = {
  fullName: 'ФИО',
  period: 'Период',
  country: 'Страна',
  countryCode: 'Код страны',
  fizicheskoyeLitsoUid: 'UID физлица',
}
const filterableFields = ['country', 'countryCode']
const hiddenByDefault = ['countryCode', 'fizicheskoyeLitsoUid']

function cellText(columnId: string, value: unknown): string {
  if (columnId === 'period' && typeof value === 'string') {
    const date = new Date(value)
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
  }
  return String(value ?? '')
}

const columnHelper = createAppColumnHelper<Citizenship>()

const columns = columnHelper.columns([
  columnHelper.accessor('fizicheskoyeLitsoUid', { header: columnLabels.fizicheskoyeLitsoUid, size: 280, minSize: 200 }),
  columnHelper.accessor('fullName', { header: columnLabels.fullName, enableHiding: false, size: 256, minSize: 160 }),
  columnHelper.accessor('period', { header: columnLabels.period, size: 128, minSize: 100 }),
  columnHelper.accessor('country', { header: columnLabels.country, size: 192, minSize: 120 }),
  columnHelper.accessor('countryCode', { header: columnLabels.countryCode, size: 128, minSize: 90 }),
])
</script>

<template>
  <div class="flex flex-1 flex-col p-4 md:p-6">
    <EntityTable
      :columns="columns"
      :column-labels="columnLabels"
      :filterable-fields="filterableFields"
      :default-sort="{ id: 'fullName', desc: false }"
      :fetch-page="fetchCitizenship"
      :fetch-facet-values="fetchFacetValues"
      :get-row-id="(c: Citizenship) => String(c.id)"
      total-label="записей о гражданстве"
      :cell-text="cellText"
      :hidden-by-default="hiddenByDefault"
      storage-key="citizenship"
    />
  </div>
</template>
