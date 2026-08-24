<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, ExternalLink, Plus, Printer } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import EntityTable from '@/components/EntityTable.vue'
import ContractStatusCell from '@/components/ContractStatusCell.vue'
import RoomCell from '@/components/RoomCell.vue'
import CreateContractDialog from '@/components/CreateContractDialog.vue'
import { createAppColumnHelper } from '@/lib/table'
import { goBack } from '@/lib/utils'
import { fetchContractsPage, fetchContractFacets, printContractsBatch, type ContractListItem } from '@/lib/contracts-api'

const router = useRouter()

// Выбор строк чекбоксами — только текущая страница списка (см. EntityTable.vue#selectable),
// печать пачкой дёргает по одному id за раз на бэке (contracts.controller.ts#printBatch) и
// отдаёт ZIP с отдельным .docx на каждый договор.
const selectedContracts = ref<ContractListItem[]>([])
const isPrinting = ref(false)
const printError = ref('')
async function onPrintSelected() {
  if (!selectedContracts.value.length) return
  printError.value = ''
  isPrinting.value = true
  try {
    await printContractsBatch(selectedContracts.value.map((c) => c.id))
    selectedContracts.value = []
  } catch (error) {
    printError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isPrinting.value = false
  }
}

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
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/')">
        <ArrowLeft class="text-primary" />
        <span class="sr-only">Назад</span>
      </Button>
      <h1 class="text-lg font-medium">Договоры найма</h1>
    </div>

    <p v-if="printError" class="text-sm text-red-500">{{ printError }}</p>

    <EntityTable
      v-model:selected="selectedContracts"
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
      selectable
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
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              size="icon"
              variant="outline"
              :disabled="!selectedContracts.length"
              :loading="isPrinting"
              @click="onPrintSelected"
            >
              <Printer :class="{ 'text-primary': selectedContracts.length }" />
              <span class="sr-only">Распечатать выбранные договоры</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {{ selectedContracts.length ? `Распечатать выбранные (${selectedContracts.length})` : 'Выберите договоры чекбоксом' }}
          </TooltipContent>
        </Tooltip>
        <Separator orientation="vertical" class="h-6" />
      </template>
    </EntityTable>

    <CreateContractDialog ref="createDialogRef" />
  </div>
</template>
