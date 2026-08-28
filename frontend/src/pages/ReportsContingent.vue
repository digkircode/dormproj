<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ArrowLeft, Download } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import EntityTable from '@/components/EntityTable.vue'
import ResidentLinkCell from '@/components/ResidentLinkCell.vue'
import ContractLinkCell from '@/components/ContractLinkCell.vue'
import DatePickerField from '@/components/DatePickerField.vue'
import { createAppColumnHelper } from '@/lib/table'
import { fetchContingentPage, fetchContingentFacets, exportContingentExcel, type ContingentRow, type ListOptions } from '@/lib/reports-api'
import { goBack } from '@/lib/utils'

const router = useRouter()
const { t } = useI18n()

const columnLabels = computed<Record<string, string>>(() => ({
  movedInDate: t('reports.contingent.colMovedInDate'),
  residentFullName: t('reports.contingent.colResident'),
  contractNumber: t('reports.contingent.colContractNumber'),
  room: t('reports.contingent.colRoom'),
  facultet: t('reports.contingent.colFacultet'),
  kursNumber: t('reports.contingent.colKurs'),
  birthDate: t('reports.contingent.colBirthDate'),
  citizenship: t('reports.contingent.colCitizenship'),
  // Фильтры без собственной колонки — та же схема, что bucket в ReportsContractsRegistry.vue.
  citizenshipGroup: t('reports.contingent.colCitizenship'),
  isOwnUniversity: t('reports.contingent.colOwnUniversity'),
}))
const filterableFields = ['facultet', 'kursNumber', 'citizenshipGroup', 'isOwnUniversity']
const cellRenderers = { residentFullName: ResidentLinkCell, contractNumber: ContractLinkCell }

function formatDateIso(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
}
function cellText(columnId: string, value: unknown): string {
  if ((columnId === 'movedInDate' || columnId === 'birthDate') && typeof value === 'string') {
    return formatDateIso(value)
  }
  return String(value ?? '')
}

const columnHelper = createAppColumnHelper<ContingentRow>()
const columns = computed(() =>
  columnHelper.columns([
    columnHelper.accessor('movedInDate', { header: columnLabels.value.movedInDate, size: 140, minSize: 110 }),
    columnHelper.accessor('residentFullName', { header: columnLabels.value.residentFullName, enableHiding: false, size: 220, minSize: 160 }),
    columnHelper.accessor('contractNumber', { header: columnLabels.value.contractNumber, size: 140, minSize: 110 }),
    columnHelper.accessor('room', { header: columnLabels.value.room, size: 110, minSize: 90 }),
    columnHelper.accessor('facultet', { header: columnLabels.value.facultet, size: 180, minSize: 120 }),
    columnHelper.accessor('kursNumber', { header: columnLabels.value.kursNumber, size: 90, minSize: 80 }),
    columnHelper.accessor('birthDate', { header: columnLabels.value.birthDate, size: 140, minSize: 110 }),
    columnHelper.accessor('citizenship', { header: columnLabels.value.citizenship, size: 160, minSize: 120 }),
  ]),
)

// Отчёт "на дату" (по умолчанию сегодня) — тот же приём, что период в ReportsMovements.vue/
// дата в ReportsDebt.vue: EntityTable сама не знает про внешний asOf, перезапрашиваем
// страницу вручную через её exposed refresh() при смене даты.
function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}
const asOf = ref(isoToday())

function fetchPage(options: ListOptions, signal?: AbortSignal) {
  return fetchContingentPage(options, asOf.value, signal)
}

const entityTable = ref<{ refresh: () => void } | null>(null)
watch(asOf, () => entityTable.value?.refresh())

const isExporting = ref(false)
const exportError = ref('')
async function onExport() {
  exportError.value = ''
  isExporting.value = true
  try {
    await exportContingentExcel(asOf.value)
  } catch (error) {
    exportError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isExporting.value = false
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/')">
        <ArrowLeft class="text-primary" />
        <span class="sr-only">{{ t('reports.common.back') }}</span>
      </Button>
      <h1 class="text-lg font-medium">{{ t('reports.contingent.title') }}</h1>
    </div>

    <EntityTable
      ref="entityTable"
      :columns="columns"
      :column-labels="columnLabels"
      :filterable-fields="filterableFields"
      :default-sort="{ id: 'movedInDate', desc: true }"
      :fetch-page="fetchPage"
      :fetch-facet-values="fetchContingentFacets"
      :get-row-id="(r: ContingentRow) => String(r.contractId)"
      :total-label="t('reports.contingent.totalLabel')"
      :cell-text="cellText"
      :cell-renderers="cellRenderers"
      storage-key="reports-contingent"
      accent-icons
    >
      <template #actions>
        <span class="text-sm text-muted-foreground">{{ t('reports.common.asOf') }}</span>
        <DatePickerField v-model="asOf" />
        <Tooltip>
          <TooltipTrigger as-child>
            <Button size="icon" :loading="isExporting" @click="onExport">
              <Download />
              <span class="sr-only">{{ t('reports.common.exportExcel') }}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{{ t('reports.common.exportExcel') }}</TooltipContent>
        </Tooltip>
      </template>
    </EntityTable>
    <p v-if="exportError" class="text-sm text-red-500">{{ exportError }}</p>
  </div>
</template>
