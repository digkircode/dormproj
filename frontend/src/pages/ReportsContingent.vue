<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import EntityTable from '@/components/EntityTable.vue'
import ResidentLinkCell from '@/components/ResidentLinkCell.vue'
import ContractLinkCell from '@/components/ContractLinkCell.vue'
import DatePickerField from '@/components/DatePickerField.vue'
import { createAppColumnHelper } from '@/lib/table'
import { fetchContingentPage, fetchContingentFacets, type ContingentRow, type ListOptions } from '@/lib/reports-api'
import { goBack } from '@/lib/utils'

const router = useRouter()

const columnLabels: Record<string, string> = {
  movedInDate: 'Дата заселения',
  residentFullName: 'Проживающий',
  contractNumber: '№ договора',
  room: 'Комната',
  facultet: 'Факультет',
  kursNumber: 'Курс',
  birthDate: 'Дата рождения',
  citizenship: 'Гражданство',
  // Фильтры без собственной колонки — та же схема, что bucket в ReportsContractsRegistry.vue.
  citizenshipGroup: 'Гражданство',
  isOwnUniversity: 'Студент РосНОУ',
}
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
const columns = columnHelper.columns([
  columnHelper.accessor('movedInDate', { header: columnLabels.movedInDate, size: 140, minSize: 110 }),
  columnHelper.accessor('residentFullName', { header: columnLabels.residentFullName, enableHiding: false, size: 220, minSize: 160 }),
  columnHelper.accessor('contractNumber', { header: columnLabels.contractNumber, size: 140, minSize: 110 }),
  columnHelper.accessor('room', { header: columnLabels.room, size: 110, minSize: 90 }),
  columnHelper.accessor('facultet', { header: columnLabels.facultet, size: 180, minSize: 120 }),
  columnHelper.accessor('kursNumber', { header: columnLabels.kursNumber, size: 90, minSize: 80 }),
  columnHelper.accessor('birthDate', { header: columnLabels.birthDate, size: 140, minSize: 110 }),
  columnHelper.accessor('citizenship', { header: columnLabels.citizenship, size: 160, minSize: 120 }),
])

// Отчёт "на дату" (по умолчанию сегодня) — тот же приём, что период в ReportsMovements.vue/
// дата в ReportsDebt.vue: EntityTable сама не знает про внешний asOf, перезапрашиваем
// страницу вручную через её exposed refresh() при смене даты.
function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}
const asOf = ref(isoToday())

function fetchPage(options: ListOptions) {
  return fetchContingentPage(options, asOf.value)
}

const entityTable = ref<{ refresh: () => void } | null>(null)
watch(asOf, () => entityTable.value?.refresh())
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/')">
        <ArrowLeft class="text-primary" />
        <span class="sr-only">Назад</span>
      </Button>
      <h1 class="text-lg font-medium">Реестр проживающих</h1>
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
      total-label="проживающих"
      :cell-text="cellText"
      :cell-renderers="cellRenderers"
      storage-key="reports-contingent"
      accent-icons
    >
      <template #actions>
        <span class="text-sm text-muted-foreground">На дату</span>
        <DatePickerField v-model="asOf" />
      </template>
    </EntityTable>
  </div>
</template>
