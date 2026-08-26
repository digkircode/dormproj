<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import EntityTable from '@/components/EntityTable.vue'
import { createAppColumnHelper } from '@/lib/table'
import { fetchFacetValues, fetchPassports, type Passport } from '@/lib/passport-api'
import { goBack } from '@/lib/utils'

const router = useRouter()
const { t } = useI18n()

const columnLabels = computed<Record<string, string>>(() => ({
  fullName: t('individuals.systemTables.colFullName'),
  period: t('individuals.systemTables.passport.colPeriod'),
  type: t('individuals.systemTables.passport.colType'),
  series: t('individuals.systemTables.passport.colSeries'),
  number: t('individuals.systemTables.passport.colNumber'),
  dateStart: t('individuals.systemTables.passport.colDateStart'),
  unit: t('individuals.systemTables.passport.colUnit'),
  codeUnit: t('individuals.systemTables.passport.colCodeUnit'),
  systemDoc: t('individuals.systemTables.passport.colSystemDoc'),
  fizicheskoyeLitsoUid: t('individuals.systemTables.colUid'),
}))
const filterableFields = ['type']
const hiddenByDefault = ['systemDoc', 'fizicheskoyeLitsoUid']

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

const columns = computed(() =>
  columnHelper.columns([
    columnHelper.accessor('fizicheskoyeLitsoUid', { header: columnLabels.value.fizicheskoyeLitsoUid, size: 280, minSize: 200 }),
    columnHelper.accessor('fullName', { header: columnLabels.value.fullName, enableHiding: false, size: 224, minSize: 160 }),
    columnHelper.accessor('period', { header: columnLabels.value.period, size: 112, minSize: 100 }),
    columnHelper.accessor('type', { header: columnLabels.value.type, size: 144, minSize: 100 }),
    columnHelper.accessor('series', { header: columnLabels.value.series, size: 96, minSize: 80 }),
    columnHelper.accessor('number', { header: columnLabels.value.number, size: 112, minSize: 90 }),
    columnHelper.accessor('dateStart', { header: columnLabels.value.dateStart, size: 128, minSize: 100 }),
    columnHelper.accessor('unit', { header: columnLabels.value.unit, size: 288, minSize: 160 }),
    columnHelper.accessor('codeUnit', { header: columnLabels.value.codeUnit, size: 144, minSize: 100 }),
    columnHelper.accessor('systemDoc', { header: columnLabels.value.systemDoc, size: 144, minSize: 100 }),
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
      <h1 class="text-lg font-medium">{{ t('individuals.systemTables.passport.title') }}</h1>
    </div>

    <EntityTable
      :columns="columns"
      :column-labels="columnLabels"
      :filterable-fields="filterableFields"
      :default-sort="{ id: 'fullName', desc: false }"
      :fetch-page="fetchPassports"
      :fetch-facet-values="fetchFacetValues"
      :get-row-id="(p: Passport) => String(p.id)"
      :total-label="t('individuals.systemTables.passport.totalLabel')"
      :cell-text="cellText"
      :hidden-by-default="hiddenByDefault"
      storage-key="passport"
      accent-icons
    />
  </div>
</template>
