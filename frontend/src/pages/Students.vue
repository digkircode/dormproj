<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import EntityTable from '@/components/EntityTable.vue'
import { createAppColumnHelper } from '@/lib/table'
import { fetchFacetValues, fetchStudents, type Student } from '@/lib/students-api'
import { goBack } from '@/lib/utils'

const router = useRouter()
const { t } = useI18n()

const columnLabels = computed<Record<string, string>>(() => ({
  fullName: t('individuals.systemTables.colFullName'),
  zachetnayaKniga: t('individuals.systemTables.students.colZachetnayaKniga'),
  group: t('individuals.systemTables.students.colGroup'),
  kurs: t('individuals.systemTables.students.colKurs'),
  facultet: t('individuals.systemTables.students.colFacultet'),
  speciality: t('individuals.systemTables.students.colSpeciality'),
  formObuch: t('individuals.systemTables.students.colFormObuch'),
  osnovaObuch: t('individuals.systemTables.students.colOsnovaObuch'),
  urovenPodgotov: t('individuals.systemTables.students.colUrovenPodgotov'),
  profilSpec: t('individuals.systemTables.students.colProfilSpec'),
  dot: t('individuals.systemTables.students.colDot'),
  uchebYear: t('individuals.systemTables.students.colUchebYear'),
  zachetnayaKnigaUid: t('individuals.systemTables.students.colZachetnayaKnigaUid'),
  fizicheskoyeLitsoUid: t('individuals.systemTables.colUid'),
}))
// ФИО/зачётка/группа — почти уникальны на строку, для мультивыбора не годятся.
// UID-поля — технические, для фильтра-мультивыбора бессмысленны в принципе.
const NON_FILTERABLE_FIELDS = new Set([
  'fullName',
  'zachetnayaKniga',
  'group',
  'zachetnayaKnigaUid',
  'fizicheskoyeLitsoUid',
])
const filterableFields = Object.keys(columnLabels.value).filter((f) => !NON_FILTERABLE_FIELDS.has(f))
const hiddenByDefault = ['zachetnayaKnigaUid', 'fizicheskoyeLitsoUid']

// Текст ячейки — должен совпадать с тем, что реально отрисовано, а не с сырым
// значением (у profilSpec/dot свой формат), используется и в теле, и в тултипе.
function cellText(columnId: string, value: unknown): string {
  if (columnId === 'profilSpec') return (value as string | null) || '—'
  if (columnId === 'dot') return value ? t('boolean.yes') : t('boolean.no')
  return String(value ?? '')
}

const columnHelper = createAppColumnHelper<Student>()

const columns = computed(() =>
  columnHelper.columns([
    columnHelper.accessor('fizicheskoyeLitsoUid', { header: columnLabels.value.fizicheskoyeLitsoUid, size: 280, minSize: 200 }),
    columnHelper.accessor('zachetnayaKnigaUid', { header: columnLabels.value.zachetnayaKnigaUid, size: 280, minSize: 200 }),
    columnHelper.accessor('fullName', { header: columnLabels.value.fullName, enableHiding: false, size: 224, minSize: 140 }),
    columnHelper.accessor('zachetnayaKniga', { header: columnLabels.value.zachetnayaKniga, size: 144, minSize: 90 }),
    columnHelper.accessor('group', { header: columnLabels.value.group, size: 160, minSize: 90 }),
    columnHelper.accessor('kurs', { header: columnLabels.value.kurs, size: 96, minSize: 70 }),
    columnHelper.accessor('facultet', { header: columnLabels.value.facultet, size: 256, minSize: 140 }),
    columnHelper.accessor('speciality', { header: columnLabels.value.speciality, size: 224, minSize: 140 }),
    columnHelper.accessor('formObuch', { header: columnLabels.value.formObuch, size: 128, minSize: 90 }),
    columnHelper.accessor('osnovaObuch', { header: columnLabels.value.osnovaObuch, size: 160, minSize: 100 }),
    columnHelper.accessor('urovenPodgotov', { header: columnLabels.value.urovenPodgotov, size: 144, minSize: 100 }),
    columnHelper.accessor('profilSpec', { header: columnLabels.value.profilSpec, size: 224, minSize: 120 }),
    columnHelper.accessor('dot', { header: columnLabels.value.dot, size: 64, minSize: 56 }),
    columnHelper.accessor('uchebYear', { header: columnLabels.value.uchebYear, size: 112, minSize: 80 }),
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
      <h1 class="text-lg font-medium">{{ t('individuals.systemTables.students.title') }}</h1>
    </div>

    <EntityTable
      :columns="columns"
      :column-labels="columnLabels"
      :filterable-fields="filterableFields"
      :default-sort="{ id: 'fullName', desc: false }"
      :fetch-page="fetchStudents"
      :fetch-facet-values="fetchFacetValues"
      :get-row-id="(s: Student) => `${s.zachetnayaKnigaUid}:${s.fizicheskoyeLitsoUid}`"
      :total-label="t('individuals.systemTables.students.totalLabel')"
      :cell-text="cellText"
      :hidden-by-default="hiddenByDefault"
      storage-key="students"
      accent-icons
    />
  </div>
</template>
