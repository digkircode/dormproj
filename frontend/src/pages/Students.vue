<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ColumnVisibilityState, PaginationState, SortingState } from '@tanstack/vue-table'
import {
  columnVisibilityFeature,
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  FlexRender,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from '@tanstack/vue-table'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  Settings2,
} from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

const SEARCH_DEBOUNCE_MS = 350

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
}

// table-layout: fixed берёт ширины из этой шапки — без них таблицу на каждой
// странице растягивало/сужало под длину конкретного текста в ячейках.
const columnWidths: Record<string, string> = {
  fullName: 'w-56',
  zachetnayaKniga: 'w-36',
  group: 'w-40',
  kurs: 'w-24',
  facultet: 'w-64',
  speciality: 'w-56',
  formObuch: 'w-32',
  osnovaObuch: 'w-40',
  urovenPodgotov: 'w-36',
  profilSpec: 'w-56',
  dot: 'w-16',
  uchebYear: 'w-28',
}

const features = tableFeatures({
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSortingFeature,
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
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
  columnHelper.accessor('osnovaObuch', { header: columnLabels.osnovaObuch }),
  columnHelper.accessor('urovenPodgotov', { header: columnLabels.urovenPodgotov }),
  columnHelper.accessor('profilSpec', {
    header: columnLabels.profilSpec,
    cell: ({ row }) => row.getValue('profilSpec') || '—',
  }),
  columnHelper.accessor('dot', {
    header: columnLabels.dot,
    cell: ({ row }) => (row.getValue('dot') ? 'Да' : 'Нет'),
  }),
  columnHelper.accessor('uchebYear', { header: columnLabels.uchebYear }),
])

// Пусто = видны все колонки (в TanStack отсутствие записи значит "видима", не "скрыта").
const columnVisibility = ref<ColumnVisibilityState>({})
const pagination = ref<PaginationState>({ pageIndex: 0, pageSize: 20 })
const sorting = ref<SortingState>([{ id: 'fullName', desc: false }])
const searchInput = ref('')
const search = ref('')

const state = computed(() => ({
  pagination: pagination.value,
  columnVisibility: columnVisibility.value,
  sorting: sorting.value,
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
  manualSorting: true,
  enableSortingRemoval: false,
  enableMultiSort: false,
  rowCount: total,
  onPaginationChange: (updater) => {
    pagination.value = typeof updater === 'function' ? updater(pagination.value) : updater
  },
  onColumnVisibilityChange: (updater) => {
    columnVisibility.value = typeof updater === 'function' ? updater(columnVisibility.value) : updater
  },
  onSortingChange: (updater) => {
    sorting.value = typeof updater === 'function' ? updater(sorting.value) : updater
    pagination.value = { ...pagination.value, pageIndex: 0 }
  },
})

async function loadPage() {
  isLoading.value = true
  errorText.value = ''
  try {
    const sort = sorting.value[0]
    const page = await fetchStudents({
      page: pagination.value.pageIndex + 1,
      pageSize: pagination.value.pageSize,
      search: search.value,
      sortBy: sort?.id ?? 'fullName',
      sortDir: sort?.desc ? 'desc' : 'asc',
    })
    rows.value = page.data
    total.value = page.total
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : String(error)
  } finally {
    isLoading.value = false
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | undefined
watch(searchInput, (value) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    search.value = value.trim()
    pagination.value = { ...pagination.value, pageIndex: 0 }
  }, SEARCH_DEBOUNCE_MS)
})
onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
})

// Один watcher на все источники — если развести по отдельным watch(), правки,
// которые меняют несколько ref'ов разом (например смена сортировки сбрасывает
// ещё и pageIndex), бьют дублирующимися запросами вместо одного.
watch([pagination, sorting, search], loadPage, { deep: true })
onMounted(loadPage)
</script>

<template>
  <div class="flex flex-1 flex-col gap-4 p-4 md:p-6">
    <p v-if="errorText" class="text-sm text-red-500">{{ errorText }}</p>
    <div class="flex items-center justify-between gap-2">
      <div class="relative w-full max-w-xs">
        <Search class="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input v-model="searchInput" placeholder="Поиск по всей таблице…" class="pl-8" />
      </div>
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

    <Card class="gap-0 py-0 min-w-0">
      <div class="overflow-hidden rounded-lg border">
        <div class="overflow-x-auto transition-opacity" :class="{ 'opacity-60': isLoading }">
          <Table class="table-fixed">
            <TableHeader class="bg-muted sticky top-0 z-10">
              <TableRow v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
                <TableHead
                  v-for="header in headerGroup.headers"
                  :key="header.id"
                  :colspan="header.colSpan"
                  :class="columnWidths[header.column.id]"
                >
                  <button
                    v-if="!header.isPlaceholder"
                    type="button"
                    class="flex items-center gap-1.5 hover:text-foreground/80"
                    @click="header.column.toggleSorting(header.column.getIsSorted() === 'asc')"
                  >
                    <FlexRender :header="header" />
                    <ArrowUp v-if="header.column.getIsSorted() === 'asc'" class="size-3.5 shrink-0" />
                    <ArrowDown v-else-if="header.column.getIsSorted() === 'desc'" class="size-3.5 shrink-0" />
                    <ArrowUpDown v-else class="size-3.5 shrink-0 text-muted-foreground/50" />
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <template v-if="table.getRowModel().rows.length">
                <TableRow v-for="row in table.getRowModel().rows" :key="row.id">
                  <TableCell
                    v-for="cell in row.getVisibleCells()"
                    :key="cell.id"
                    class="truncate"
                    :class="columnWidths[cell.column.id]"
                  >
                    <FlexRender :cell="cell" />
                  </TableCell>
                </TableRow>
              </template>
              <TableRow v-else>
                <TableCell :colspan="columns.length" class="h-24 text-center text-muted-foreground">
                  {{ isLoading ? 'Загрузка…' : 'Ничего не найдено' }}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
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
            :disabled="isLoading"
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
            :disabled="isLoading || !table.getCanPreviousPage()"
            @click="table.setPageIndex(0)"
          >
            <span class="sr-only">Первая страница</span>
            <ChevronsLeft />
          </Button>
          <Button
            variant="outline"
            class="size-8"
            size="icon"
            :disabled="isLoading || !table.getCanPreviousPage()"
            @click="table.previousPage()"
          >
            <span class="sr-only">Предыдущая страница</span>
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            class="size-8"
            size="icon"
            :disabled="isLoading || !table.getCanNextPage()"
            @click="table.nextPage()"
          >
            <span class="sr-only">Следующая страница</span>
            <ChevronRight />
          </Button>
          <Button
            variant="outline"
            class="hidden size-8 lg:flex"
            :disabled="isLoading || !table.getCanNextPage()"
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
