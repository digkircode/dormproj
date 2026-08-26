<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import EntityTable from '@/components/EntityTable.vue'
import { createAppColumnHelper } from '@/lib/table'
import { fetchFacetValues, fetchContactInfo, type ContactInfo } from '@/lib/contact-info-api'
import { goBack } from '@/lib/utils'

const router = useRouter()
const { t } = useI18n()

const columnLabels = computed<Record<string, string>>(() => ({
  fullName: t('individuals.systemTables.colFullName'),
  type: t('individuals.systemTables.contactInfo.colType'),
  predstavleniye: t('individuals.systemTables.contactInfo.colPredstavleniye'),
  country: t('individuals.systemTables.contactInfo.colCountry'),
  region: t('individuals.systemTables.contactInfo.colRegion'),
  city: t('individuals.systemTables.contactInfo.colCity'),
  email: t('individuals.systemTables.contactInfo.colEmail'),
  phoneNumber: t('individuals.systemTables.contactInfo.colPhoneNumber'),
  phoneNumberNoCode: t('individuals.systemTables.contactInfo.colPhoneNumberNoCode'),
  dateStart: t('individuals.systemTables.contactInfo.colDateStart'),
  xml: t('individuals.systemTables.contactInfo.colXml'),
  json: t('individuals.systemTables.contactInfo.colJson'),
  fizicheskoyeLitsoUid: t('individuals.systemTables.colUid'),
}))
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

const columns = computed(() =>
  columnHelper.columns([
    columnHelper.accessor('fizicheskoyeLitsoUid', { header: columnLabels.value.fizicheskoyeLitsoUid, size: 280, minSize: 200 }),
    columnHelper.accessor('fullName', { header: columnLabels.value.fullName, enableHiding: false, size: 224, minSize: 160 }),
    columnHelper.accessor('type', { header: columnLabels.value.type, size: 176, minSize: 120 }),
    columnHelper.accessor('predstavleniye', { header: columnLabels.value.predstavleniye, size: 288, minSize: 160 }),
    columnHelper.accessor('country', { header: columnLabels.value.country, size: 144, minSize: 100 }),
    columnHelper.accessor('region', { header: columnLabels.value.region, size: 160, minSize: 100 }),
    columnHelper.accessor('city', { header: columnLabels.value.city, size: 144, minSize: 100 }),
    columnHelper.accessor('email', { header: columnLabels.value.email, size: 192, minSize: 120 }),
    columnHelper.accessor('phoneNumber', { header: columnLabels.value.phoneNumber, size: 144, minSize: 110 }),
    columnHelper.accessor('phoneNumberNoCode', { header: columnLabels.value.phoneNumberNoCode, size: 160, minSize: 110 }),
    columnHelper.accessor('dateStart', { header: columnLabels.value.dateStart, size: 128, minSize: 100 }),
    columnHelper.accessor('xml', { header: columnLabels.value.xml, size: 320, minSize: 160 }),
    columnHelper.accessor('json', { header: columnLabels.value.json, size: 320, minSize: 160 }),
  ]),
)
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/')">
        <ArrowLeft class="text-primary" />
        <span class="sr-only">{{ t('individuals.systemTables.back') }}</span>
      </Button>
      <h1 class="text-lg font-medium">{{ t('individuals.systemTables.contactInfo.title') }}</h1>
    </div>

    <EntityTable
      :columns="columns"
      :column-labels="columnLabels"
      :filterable-fields="filterableFields"
      :default-sort="{ id: 'fullName', desc: false }"
      :fetch-page="fetchContactInfo"
      :fetch-facet-values="fetchFacetValues"
      :get-row-id="(c: ContactInfo) => String(c.id)"
      :total-label="t('individuals.systemTables.contactInfo.totalLabel')"
      :cell-text="cellText"
      :hidden-by-default="hiddenByDefault"
      storage-key="contact-info"
      accent-icons
    />
  </div>
</template>
