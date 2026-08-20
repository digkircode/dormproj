<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, CircleCheck, CircleX, Clock } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import EntityTable from '@/components/EntityTable.vue'
import ContractLinkCell from '@/components/ContractLinkCell.vue'
import ResidentLinkCell from '@/components/ResidentLinkCell.vue'
import ContractRegistryStatusCell from '@/components/ContractRegistryStatusCell.vue'
import ReportKpiTile from '@/components/ReportKpiTile.vue'
import { createAppColumnHelper } from '@/lib/table'
import {
  fetchContractsRegistryPage,
  fetchContractsRegistryFacets,
  fetchContractsRegistrySummary,
  type ContractRegistryRow,
  type ContractsRegistrySummary,
} from '@/lib/reports-api'
import { goBack } from '@/lib/utils'

const router = useRouter()

const columnLabels: Record<string, string> = {
  contractNumber: '№ договора',
  residentFullName: 'Проживающий',
  room: 'Комната',
  createdAt: 'Дата создания',
  startDate: 'Начало',
  endDate: 'Окончание',
  bucket: 'Статус',
}
const filterableFields = ['bucket']
const cellRenderers = { contractNumber: ContractLinkCell, residentFullName: ResidentLinkCell, bucket: ContractRegistryStatusCell }

function formatDateIso(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
}
function cellText(columnId: string, value: unknown): string {
  if ((columnId === 'createdAt' || columnId === 'startDate' || columnId === 'endDate') && typeof value === 'string') {
    return formatDateIso(value)
  }
  return String(value ?? '')
}

const columnHelper = createAppColumnHelper<ContractRegistryRow>()
const columns = columnHelper.columns([
  columnHelper.accessor('contractNumber', { header: columnLabels.contractNumber, enableHiding: false, size: 128, minSize: 100 }),
  columnHelper.accessor('residentFullName', { header: columnLabels.residentFullName, size: 220, minSize: 160 }),
  columnHelper.accessor('room', { header: columnLabels.room, size: 110, minSize: 90 }),
  columnHelper.accessor('createdAt', { header: columnLabels.createdAt, size: 128, minSize: 100 }),
  columnHelper.accessor('startDate', { header: columnLabels.startDate, size: 128, minSize: 100 }),
  columnHelper.accessor('endDate', { header: columnLabels.endDate, size: 128, minSize: 100 }),
  columnHelper.accessor('bucket', { header: columnLabels.bucket, size: 160, minSize: 130 }),
])

const summary = ref<ContractsRegistrySummary | null>(null)
onMounted(async () => {
  summary.value = await fetchContractsRegistrySummary()
})
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/')">
        <ArrowLeft class="text-primary" />
        <span class="sr-only">Назад</span>
      </Button>
      <h1 class="text-lg font-medium">Реестр договоров</h1>
    </div>

    <Card v-if="summary" class="grid grid-cols-3 gap-4 p-4">
      <ReportKpiTile
        :icon="CircleCheck"
        bg-class="bg-emerald-100 dark:bg-emerald-500/15"
        icon-class="text-emerald-600 dark:text-emerald-400"
        label="Активные"
        :value="String(summary.active)"
      />
      <ReportKpiTile
        :icon="Clock"
        bg-class="bg-orange-100 dark:bg-orange-500/15"
        icon-class="text-orange-600 dark:text-orange-400"
        label="Истекают в течение 30 дней"
        :value="String(summary.expiring30)"
      />
      <ReportKpiTile
        :icon="CircleX"
        bg-class="bg-red-100 dark:bg-red-500/15"
        icon-class="text-red-600 dark:text-red-400"
        label="Уже закончены"
        :value="String(summary.ended)"
      />
    </Card>

    <EntityTable
      :columns="columns"
      :column-labels="columnLabels"
      :filterable-fields="filterableFields"
      :default-sort="{ id: 'endDate', desc: false }"
      :fetch-page="fetchContractsRegistryPage"
      :fetch-facet-values="fetchContractsRegistryFacets"
      :get-row-id="(c: ContractRegistryRow) => String(c.contractId)"
      total-label="договоров"
      :cell-text="cellText"
      :cell-renderers="cellRenderers"
      storage-key="reports-contracts-registry"
      accent-icons
    />
  </div>
</template>
