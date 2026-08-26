<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ArrowLeft, ExternalLink, Plus } from 'lucide-vue-next'
import EntityTable from '@/components/EntityTable.vue'
import CreateIndividualDialog from '@/components/CreateIndividualDialog.vue'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { createAppColumnHelper } from '@/lib/table'
import { fetchFacetValues, fetchIndividuals, type Individual } from '@/lib/individuals-api'
import { goBack } from '@/lib/utils'

const router = useRouter()
const { t } = useI18n()

const columnLabels = computed<Record<string, string>>(() => ({
  fullName: t('individuals.list.colFullName'),
  code: t('individuals.list.colCode'),
  birthDate: t('individuals.list.colBirthDate'),
  gender: t('individuals.list.colGender'),
  snils: t('individuals.list.colSnils'),
  inn: t('individuals.list.colInn'),
  fizicheskoyeLitsoUid: t('individuals.list.colUid'),
}))
const filterableFields = ['gender']
const hiddenByDefault = ['fizicheskoyeLitsoUid']

// gender — литерал 'Мужской'/'Женский' (см. individuals-api.ts, соответствует значению
// в БД), переводим только отображение, те же ключи, что и в CreateContractDialog.vue.
function cellText(columnId: string, value: unknown): string {
  if (columnId === 'birthDate' && typeof value === 'string') {
    const date = new Date(value)
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
  }
  if (columnId === 'gender' && value === 'Мужской') return t('contracts.gender.male')
  if (columnId === 'gender' && value === 'Женский') return t('contracts.gender.female')
  return String(value ?? '')
}

const columnHelper = createAppColumnHelper<Individual>()

const columns = computed(() =>
  columnHelper.columns([
    columnHelper.accessor('fizicheskoyeLitsoUid', { header: columnLabels.value.fizicheskoyeLitsoUid, size: 280, minSize: 200 }),
    columnHelper.accessor('fullName', { header: columnLabels.value.fullName, enableHiding: false, size: 256, minSize: 160 }),
    columnHelper.accessor('code', { header: columnLabels.value.code, size: 128, minSize: 90 }),
    columnHelper.accessor('birthDate', { header: columnLabels.value.birthDate, size: 128, minSize: 100 }),
    columnHelper.accessor('gender', { header: columnLabels.value.gender, size: 96, minSize: 80 }),
    columnHelper.accessor('snils', { header: columnLabels.value.snils, size: 144, minSize: 100 }),
    columnHelper.accessor('inn', { header: columnLabels.value.inn, size: 144, minSize: 100 }),
  ]),
)

const createDialogRef = ref<InstanceType<typeof CreateIndividualDialog> | null>(null)
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/')">
        <ArrowLeft class="text-primary" />
        <span class="sr-only">{{ t('individuals.list.back') }}</span>
      </Button>
      <h1 class="text-lg font-medium">{{ t('individuals.list.title') }}</h1>
    </div>

    <EntityTable
      :columns="columns"
      :column-labels="columnLabels"
      :filterable-fields="filterableFields"
      :default-sort="{ id: 'fullName', desc: false }"
      :fetch-page="fetchIndividuals"
      :fetch-facet-values="fetchFacetValues"
      :get-row-id="(i: Individual) => i.fizicheskoyeLitsoUid"
      :total-label="t('individuals.list.totalLabel')"
      :cell-text="cellText"
      :hidden-by-default="hiddenByDefault"
      storage-key="individuals"
      accent-icons
      :row-action="{
        icon: ExternalLink,
        label: t('individuals.list.openCard'),
        getHref: (i: Individual) => `/individuals/${encodeURIComponent(i.fizicheskoyeLitsoUid)}`,
      }"
    >
      <template #actions>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button size="icon" @click="createDialogRef?.open()">
              <Plus />
              <span class="sr-only">{{ t('individuals.list.newIndividual') }}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{{ t('individuals.list.newIndividual') }}</TooltipContent>
        </Tooltip>
      </template>
    </EntityTable>

    <CreateIndividualDialog ref="createDialogRef" />
  </div>
</template>
