<script setup lang="ts">
import EntityTable from '@/components/EntityTable.vue'
import { createAppColumnHelper } from '@/lib/table'
import { fetchFacetValues, fetchContactInfo, type ContactInfo } from '@/lib/contact-info-api'

const columnLabels: Record<string, string> = {
  fullName: 'ФИО',
  type: 'Тип',
  predstavleniye: 'Представление',
  country: 'Страна',
  region: 'Регион',
  city: 'Город',
  email: 'Email',
  phoneNumber: 'Телефон',
  phoneNumberNoCode: 'Телефон без кода',
  dateStart: 'Дата начала',
  xml: 'XML',
  json: 'JSON',
  fizicheskoyeLitsoUid: 'UID физлица',
}
const filterableFields = ['type', 'country']
const hiddenByDefault = ['xml', 'json', 'fizicheskoyeLitsoUid']

// 1С отдаёт "0001-01-01" как "дата не задана" — показываем такое как "—", а не 01.01.0001.
function cellText(columnId: string, value: unknown): string {
  if (columnId === 'dateStart' && typeof value === 'string') {
    const date = new Date(value)
    if (date.getUTCFullYear() <= 1) return '—'
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
  }
  return String(value ?? '')
}

const columnHelper = createAppColumnHelper<ContactInfo>()

const columns = columnHelper.columns([
  columnHelper.accessor('fizicheskoyeLitsoUid', { header: columnLabels.fizicheskoyeLitsoUid, size: 280, minSize: 200 }),
  columnHelper.accessor('fullName', { header: columnLabels.fullName, enableHiding: false, size: 224, minSize: 160 }),
  columnHelper.accessor('type', { header: columnLabels.type, size: 176, minSize: 120 }),
  columnHelper.accessor('predstavleniye', { header: columnLabels.predstavleniye, size: 288, minSize: 160 }),
  columnHelper.accessor('country', { header: columnLabels.country, size: 144, minSize: 100 }),
  columnHelper.accessor('region', { header: columnLabels.region, size: 160, minSize: 100 }),
  columnHelper.accessor('city', { header: columnLabels.city, size: 144, minSize: 100 }),
  columnHelper.accessor('email', { header: columnLabels.email, size: 192, minSize: 120 }),
  columnHelper.accessor('phoneNumber', { header: columnLabels.phoneNumber, size: 144, minSize: 110 }),
  columnHelper.accessor('phoneNumberNoCode', { header: columnLabels.phoneNumberNoCode, size: 160, minSize: 110 }),
  columnHelper.accessor('dateStart', { header: columnLabels.dateStart, size: 128, minSize: 100 }),
  columnHelper.accessor('xml', { header: columnLabels.xml, size: 320, minSize: 160 }),
  columnHelper.accessor('json', { header: columnLabels.json, size: 320, minSize: 160 }),
])
</script>

<template>
  <div class="flex flex-1 flex-col p-4 md:p-6">
    <EntityTable
      :columns="columns"
      :column-labels="columnLabels"
      :filterable-fields="filterableFields"
      :default-sort="{ id: 'fullName', desc: false }"
      :fetch-page="fetchContactInfo"
      :fetch-facet-values="fetchFacetValues"
      :get-row-id="(c: ContactInfo) => String(c.id)"
      total-label="записей контактной информации"
      :cell-text="cellText"
      :hidden-by-default="hiddenByDefault"
      storage-key="contact-info"
      accent-icons
    />
  </div>
</template>
