<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { ColumnVisibilityState, PaginationState } from '@tanstack/vue-table'
import {
  columnVisibilityFeature,
  createColumnHelper,
  createPaginatedRowModel,
  FlexRender,
  rowPaginationFeature,
  tableFeatures,
  useTable,
} from '@tanstack/vue-table'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Settings2 } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { fetchStudents, type Student } from '@/lib/students-api'

const columnLabels: Record<string, string> = {
  fullName: 'ФИО',
  zachetnayaKniga: 'Зачётная книжка',
  group: 'Группа',
  kurs: 'Курс',
  facultet: 'Факультет',
  speciality: 'Специальность',
  formObuch: 'Форма обучения',
  uchebStatus: 'Статус',
  osnovaObuch: 'Основание обучения',
  urovenPodgotov: 'Уровень подготовки',
  profilSpec: 'Профиль',
  uchebYear: 'Учебный год',
  dot: 'ДОТ',
}

const features = tableFeatures({
  columnVisibilityFeature,
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
})

const columnHelper = createColumnHelper<typeof features, Student>()

const columns = columnHelper.columns([
  columnHelper.accessor('fullName', { header: columnLabels.fullName, enableHiding: false }),
  columnHelper.accessor('zachetnayaKniga', { header: columnLabels.zachetnayaKniga }),
  columnHelper.accessor('group', { header: columnLabels.group }),
  columnHelper.accessor('kurs', { header: columnLabels.kurs }),
  columnHelper.accessor('facultet', { header: columnLabels.facultet }),
  columnHelper.accessor('speciality', { header: columnLabels.speciality }),
  columnHelper.accessor('formObuch', { header: columnLabels.formObuch }),
  columnHelper.accessor('uchebStatus', { header: columnLabels.uchebStatus }),
  columnHelper.accessor('osnovaObuch', { header: columnLabels.osnovaObuch }),
  columnHelper.accessor('urovenPodgotov', { header: columnLabels.urovenPodgotov }),
  columnHelper.accessor('profilSpec', {
    header: columnLabels.profilSpec,
    cell: ({ row }) => row.getValue('profilSpec') || '—',
  }),
  columnHelper.accessor('uchebYear', { header: columnLabels.uchebYear }),
  columnHelper.accessor('dot', {
    header: columnLabels.dot,
    cell: ({ row }) => (row.getValue('dot') ? 'Да' : 'Нет'),
  }),
])

const columnVisibility = ref<ColumnVisibilityState>({
  osnovaObuch: false,
  urovenPodgotov: false,
  profilSpec: false,
  uchebYear: false,
  dot: false,
})

const pagination = ref<PaginationState>({ pageIndex: 0, pageSize: 20 })

const state = computed(() => ({
  pagination: pagination.value,
  columnVisibility: columnVisibility.value,
}))

const rows = ref<Student[]>([])
const total = ref(0)
const isLoading = ref(false)
const errorText = ref('')

const table = useTable({
  features,
  columns,
  data: rows,
  state,
  manualPagination: true,
  rowCount: total,
  onPaginationChange: (updater) => {
    pagination.value = typeof updater === 'function' ? updater(pagination.value) : updater
  },
  onColumnVisibilityChange: (updater) => {
    columnVisibility.value = typeof updater === 'function' ? updater(columnVisibility.value) : updater
  },
})

async function loadPage() {
  isLoading.value = true
  errorText.value = ''
  try {
    const page = await fetchStudents(pagination.value.pageIndex + 1, pagination.value.pageSize)
    rows.value = page.data
    total.value = page.total
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : String(error)
  } finally {
    isLoading.value = false
  }
}

watch(pagination, loadPage, { deep: true })
onMounted(loadPage)
</script>

<template>
  <div class="flex flex-1 flex-col gap-4 p-4 md:p-6">
    <p v-if="errorText" class="text-sm text-red-500">{{ errorText }}</p>
    <div class="flex items-center justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="outline" size="sm">
            <Settings2 />
            <span>Настройка таблицы</span>
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-56">
          <DropdownMenuCheckboxItem
            v-for="column in table.getAllColumns().filter((c) => c.getCanHide())"
            :key="column.id"
            :model-value="column.getIsVisible()"
            @update:model-value="(value) => column.toggleVisibility(!!value)"
          >
            {{ columnLabels[column.id] ?? column.id }}
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <Card class="gap-0 py-0">
      <div class="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader class="bg-muted sticky top-0 z-10">
            <TableRow v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
              <TableHead v-for="header in headerGroup.headers" :key="header.id" :colspan="header.colSpan">
                <FlexRender v-if="!header.isPlaceholder" :header="header" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-if="table.getRowModel().rows.length">
              <TableRow v-for="row in table.getRowModel().rows" :key="row.id">
                <TableCell v-for="cell in row.getVisibleCells()" :key="cell.id">
                  <FlexRender :cell="cell" />
                </TableCell>
              </TableRow>
            </template>
            <TableRow v-else>
              <TableCell :colspan="columns.length" class="h-24 text-center text-muted-foreground">
                {{ isLoading ? 'Загрузка…' : 'Нет данных' }}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </Card>

    <div class="flex items-center justify-between px-1">
      <div class="text-muted-foreground text-sm">
        Всего студентов: {{ total }}
      </div>
      <div class="flex w-fit items-center gap-8">
        <div class="flex items-center gap-2">
          <Label for="rows-per-page" class="text-sm font-medium">Строк на странице</Label>
          <Select
            :model-value="`${pagination.pageSize}`"
            @update:model-value="(value) => table.setPageSize(Number(value))"
          >
            <SelectTrigger id="rows-per-page" size="sm" class="w-20">
              <SelectValue :placeholder="`${pagination.pageSize}`" />
            </SelectTrigger>
            <SelectContent side="top">
              <SelectItem v-for="pageSize in [10, 20, 30, 50, 100]" :key="pageSize" :value="`${pageSize}`">
                {{ pageSize }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="flex w-fit items-center justify-center text-sm font-medium">
          Страница {{ pagination.pageIndex + 1 }} из {{ table.getPageCount() }}
        </div>
        <div class="flex items-center gap-2">
          <Button
            variant="outline"
            class="hidden h-8 w-8 p-0 lg:flex"
            :disabled="!table.getCanPreviousPage()"
            @click="table.setPageIndex(0)"
          >
            <span class="sr-only">Первая страница</span>
            <ChevronsLeft />
          </Button>
          <Button
            variant="outline"
            class="size-8"
            size="icon"
            :disabled="!table.getCanPreviousPage()"
            @click="table.previousPage()"
          >
            <span class="sr-only">Предыдущая страница</span>
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            class="size-8"
            size="icon"
            :disabled="!table.getCanNextPage()"
            @click="table.nextPage()"
          >
            <span class="sr-only">Следующая страница</span>
            <ChevronRight />
          </Button>
          <Button
            variant="outline"
            class="hidden size-8 lg:flex"
            :disabled="!table.getCanNextPage()"
            @click="table.setPageIndex(table.getPageCount() - 1)"
          >
            <span class="sr-only">Последняя страница</span>
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
