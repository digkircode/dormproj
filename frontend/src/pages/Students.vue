<script setup lang="ts">
import EntityTable from '@/components/EntityTable.vue'
import { createAppColumnHelper } from '@/lib/table'
import { fetchFacetValues, fetchStudents, type Student } from '@/lib/students-api'

const columnLabels: Record<string, string> = {
  fullName: 'ФИО',
  zachetnayaKniga: 'Зачётная книжка',
  group: 'Группа',
  kurs: 'Курс',
  facultet: 'Факультет',
  speciality: 'Специальность',
  formObuch: 'Форма обучения',
  osnovaObuch: 'Основание обучения',
  urovenPodgotov: 'Уровень подготовки',
  profilSpec: 'Профиль',
  dot: 'ДОТ',
  uchebYear: 'Учебный год',
  zachetnayaKnigaUid: 'UID зачётки',
  fizicheskoyeLitsoUid: 'UID физлица',
}
// ФИО/зачётка/группа — почти уникальны на строку, для мультивыбора не годятся.
// UID-поля — технические, для фильтра-мультивыбора бессмысленны в принципе.
const NON_FILTERABLE_FIELDS = new Set([
  'fullName',
  'zachetnayaKniga',
  'group',
  'zachetnayaKnigaUid',
  'fizicheskoyeLitsoUid',
])
const filterableFields = Object.keys(columnLabels).filter((f) => !NON_FILTERABLE_FIELDS.has(f))
const hiddenByDefault = ['zachetnayaKnigaUid', 'fizicheskoyeLitsoUid']

// Текст ячейки — должен совпадать с тем, что реально отрисовано, а не с сырым
// значением (у profilSpec/dot свой формат), используется и в теле, и в тултипе.
function cellText(columnId: string, value: unknown): string {
  if (columnId === 'profilSpec') return (value as string | null) || '—'
  if (columnId === 'dot') return value ? 'Да' : 'Нет'
  return String(value ?? '')
}

const columnHelper = createAppColumnHelper<Student>()

const columns = columnHelper.columns([
  columnHelper.accessor('fizicheskoyeLitsoUid', { header: columnLabels.fizicheskoyeLitsoUid, size: 280, minSize: 200 }),
  columnHelper.accessor('zachetnayaKnigaUid', { header: columnLabels.zachetnayaKnigaUid, size: 280, minSize: 200 }),
  columnHelper.accessor('fullName', { header: columnLabels.fullName, enableHiding: false, size: 224, minSize: 140 }),
  columnHelper.accessor('zachetnayaKniga', { header: columnLabels.zachetnayaKniga, size: 144, minSize: 90 }),
  columnHelper.accessor('group', { header: columnLabels.group, size: 160, minSize: 90 }),
  columnHelper.accessor('kurs', { header: columnLabels.kurs, size: 96, minSize: 70 }),
  columnHelper.accessor('facultet', { header: columnLabels.facultet, size: 256, minSize: 140 }),
  columnHelper.accessor('speciality', { header: columnLabels.speciality, size: 224, minSize: 140 }),
  columnHelper.accessor('formObuch', { header: columnLabels.formObuch, size: 128, minSize: 90 }),
  columnHelper.accessor('osnovaObuch', { header: columnLabels.osnovaObuch, size: 160, minSize: 100 }),
  columnHelper.accessor('urovenPodgotov', { header: columnLabels.urovenPodgotov, size: 144, minSize: 100 }),
  columnHelper.accessor('profilSpec', { header: columnLabels.profilSpec, size: 224, minSize: 120 }),
  columnHelper.accessor('dot', { header: columnLabels.dot, size: 64, minSize: 56 }),
  columnHelper.accessor('uchebYear', { header: columnLabels.uchebYear, size: 112, minSize: 80 }),
])
</script>

<template>
  <div class="flex flex-1 flex-col p-4 md:p-6">
    <EntityTable
      :columns="columns"
      :column-labels="columnLabels"
      :filterable-fields="filterableFields"
      :default-sort="{ id: 'fullName', desc: false }"
      :fetch-page="fetchStudents"
      :fetch-facet-values="fetchFacetValues"
      :get-row-id="(s: Student) => s.zachetnayaKnigaUid"
      total-label="студентов"
      :cell-text="cellText"
      :hidden-by-default="hiddenByDefault"
    />
  </div>
</template>
