<script setup lang="ts">
import { ref } from 'vue'
import { ExternalLink, Plus } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import EntityTable from '@/components/EntityTable.vue'
import ContractStatusCell from '@/components/ContractStatusCell.vue'
import RoomCell from '@/components/RoomCell.vue'
import CreateContractDialog from '@/components/CreateContractDialog.vue'
import { createAppColumnHelper } from '@/lib/table'
import { fetchContractsPage, fetchContractFacets, type ContractListItem } from '@/lib/contracts-api'

function formatDateIso(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
}

// --- Список договоров ---
const columnLabels: Record<string, string> = {
  contractDate: 'Дата договора',
  number: '№ договора',
  residentFullName: 'Проживающий',
  room: 'Комната',
  startDate: 'Начало',
  endDate: 'Окончание',
  status: 'Статус',
}
const filterableFields = ['status']
const cellRenderers = { status: ContractStatusCell, room: RoomCell }

function cellText(columnId: string, value: unknown): string {
  if ((columnId === 'contractDate' || columnId === 'startDate' || columnId === 'endDate') && typeof value === 'string') {
    return formatDateIso(value)
  }
  return String(value ?? '')
}

const columnHelper = createAppColumnHelper<ContractListItem>()

const columns = columnHelper.columns([
  columnHelper.accessor('contractDate', { header: columnLabels.contractDate, size: 140, minSize: 110 }),
  columnHelper.accessor('number', { header: columnLabels.number, enableHiding: false, size: 128, minSize: 100 }),
  columnHelper.accessor('residentFullName', { header: columnLabels.residentFullName, size: 240, minSize: 160 }),
  columnHelper.accessor('room', { header: columnLabels.room, size: 128, minSize: 100 }),
  columnHelper.accessor('startDate', { header: columnLabels.startDate, size: 128, minSize: 100 }),
  columnHelper.accessor('endDate', { header: columnLabels.endDate, size: 128, minSize: 100 }),
  columnHelper.accessor('status', { header: columnLabels.status, size: 128, minSize: 100 }),
])

const createDialogRef = ref<InstanceType<typeof CreateContractDialog> | null>(null)
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <h1 class="text-lg font-medium">Договоры найма</h1>

    <EntityTable
      :columns="columns"
      :column-labels="columnLabels"
      :filterable-fields="filterableFields"
      :default-sort="{ id: 'contractDate', desc: true }"
      :fetch-page="fetchContractsPage"
      :fetch-facet-values="fetchContractFacets"
      :get-row-id="(c: ContractListItem) => String(c.id)"
      total-label="договоров"
      :cell-text="cellText"
      :cell-renderers="cellRenderers"
      storage-key="contracts"
      accent-icons
      :row-action="{ icon: ExternalLink, label: 'Открыть договор', getHref: (c: ContractListItem) => `/contracts/${c.id}` }"
    >
      <template #actions>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button size="icon" @click="createDialogRef?.open()">
              <Plus />
              <span class="sr-only">Новый договор</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Новый договор</TooltipContent>
        </Tooltip>
      </template>
    </EntityTable>

    <CreateContractDialog ref="createDialogRef" />
  </div>
</template>
