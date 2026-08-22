<script setup lang="ts">
import { ref } from 'vue'
import { ExternalLink, Plus } from 'lucide-vue-next'
import EntityTable from '@/components/EntityTable.vue'
import CreateIndividualDialog from '@/components/CreateIndividualDialog.vue'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { createAppColumnHelper } from '@/lib/table'
import { fetchFacetValues, fetchIndividuals, type Individual } from '@/lib/individuals-api'

const columnLabels: Record<string, string> = {
  fullName: 'ФИО',
  code: 'Код',
  birthDate: 'Дата рождения',
  gender: 'Пол',
  snils: 'СНИЛС',
  inn: 'ИНН',
  fizicheskoyeLitsoUid: 'UID физлица',
}
const filterableFields = ['gender']
const hiddenByDefault = ['fizicheskoyeLitsoUid']

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
  columnHelper.accessor('fizicheskoyeLitsoUid', { header: columnLabels.fizicheskoyeLitsoUid, size: 280, minSize: 200 }),
  columnHelper.accessor('fullName', { header: columnLabels.fullName, enableHiding: false, size: 256, minSize: 160 }),
  columnHelper.accessor('code', { header: columnLabels.code, size: 128, minSize: 90 }),
  columnHelper.accessor('birthDate', { header: columnLabels.birthDate, size: 128, minSize: 100 }),
  columnHelper.accessor('gender', { header: columnLabels.gender, size: 96, minSize: 80 }),
  columnHelper.accessor('snils', { header: columnLabels.snils, size: 144, minSize: 100 }),
  columnHelper.accessor('inn', { header: columnLabels.inn, size: 144, minSize: 100 }),
])

const createDialogRef = ref<InstanceType<typeof CreateIndividualDialog> | null>(null)
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col p-4 md:p-6">
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
      :hidden-by-default="hiddenByDefault"
      storage-key="individuals"
      accent-icons
      :row-action="{
        icon: ExternalLink,
        label: 'Открыть карточку физлица',
        getHref: (i: Individual) => `/individuals/${encodeURIComponent(i.fizicheskoyeLitsoUid)}`,
      }"
    >
      <template #actions>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button size="icon" @click="createDialogRef?.open()">
              <Plus />
              <span class="sr-only">Новое физическое лицо</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Новое физическое лицо</TooltipContent>
        </Tooltip>
      </template>
    </EntityTable>

    <CreateIndividualDialog ref="createDialogRef" />
  </div>
</template>
