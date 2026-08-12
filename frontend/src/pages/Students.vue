<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ColumnVisibilityState, PaginationState, SortingState } from '@tanstack/vue-table'
import {
  columnResizingFeature,
  columnSizingFeature,
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
  ListFilter,
  Search,
  SearchX,
  Settings2,
  X,
} from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { fetchFacetValues, fetchStudents, type FacetOption, type Student } from '@/lib/students-api'

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
const filterableFields = Object.keys(columnLabels)

// Текст ячейки для title-подсказки при наведении — должен совпадать с тем, что
// реально отрисовано, а не с сырым значением (у profilSpec/dot свой рендер).
function cellTitle(columnId: string, value: unknown): string {
  if (columnId === 'profilSpec') return (value as string | null) || '—'
  if (columnId === 'dot') return value ? 'Да' : 'Нет'
  return String(value ?? '')
}

const features = tableFeatures({
  columnVisibilityFeature,
  columnSizingFeature,
  columnResizingFeature,
  rowPaginationFeature,
  rowSortingFeature,
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
})

const columnHelper = createColumnHelper<typeof features, Student>()

const columns = columnHelper.columns([
  columnHelper.accessor('fullName', { header: columnLabels.fullName, enableHiding: false, size: 224, minSize: 140 }),
  columnHelper.accessor('zachetnayaKniga', { header: columnLabels.zachetnayaKniga, size: 144, minSize: 90 }),
  columnHelper.accessor('group', { header: columnLabels.group, size: 160, minSize: 90 }),
  columnHelper.accessor('kurs', { header: columnLabels.kurs, size: 96, minSize: 70 }),
  columnHelper.accessor('facultet', { header: columnLabels.facultet, size: 256, minSize: 140 }),
  columnHelper.accessor('speciality', { header: columnLabels.speciality, size: 224, minSize: 140 }),
  columnHelper.accessor('formObuch', { header: columnLabels.formObuch, size: 128, minSize: 90 }),
  columnHelper.accessor('osnovaObuch', { header: columnLabels.osnovaObuch, size: 160, minSize: 100 }),
  columnHelper.accessor('urovenPodgotov', { header: columnLabels.urovenPodgotov, size: 144, minSize: 100 }),
  columnHelper.accessor('profilSpec', {
    header: columnLabels.profilSpec,
    size: 224,
    minSize: 120,
    cell: ({ row }) => row.getValue('profilSpec') || '—',
  }),
  columnHelper.accessor('dot', {
    header: columnLabels.dot,
    size: 64,
    minSize: 56,
    cell: ({ row }) => (row.getValue('dot') ? 'Да' : 'Нет'),
  }),
  columnHelper.accessor('uchebYear', { header: columnLabels.uchebYear, size: 112, minSize: 80 }),
])

// Пусто = видны все колонки (в TanStack отсутствие записи значит "видима", не "скрыта").
const columnVisibility = ref<ColumnVisibilityState>({})
const pagination = ref<PaginationState>({ pageIndex: 0, pageSize: 20 })
const sorting = ref<SortingState>([{ id: 'fullName', desc: false }])
const searchInput = ref('')
const search = ref('')
const activeFilterFields = ref<string[]>([])
const filterValues = ref<Record<string, string[]>>({})
const facetOptions = ref<Record<string, FacetOption[]>>({})
const filterModalField = ref<string | null>(null)
const filterModalSearch = ref('')

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
  columnResizeMode: 'onChange',
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

// CSS-переменные на ширины колонок вместо чтения column.getSize() в каждой ячейке —
// при live-перетаскивании (columnResizeMode: onChange) это заметно дешевле.
const columnSizeVars = computed(() => {
  const vars: Record<string, string> = {}
  for (const header of table.getFlatHeaders()) {
    vars[`--col-${header.column.id}-size`] = `${header.getSize()}px`
  }
  return vars
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
      filters: filterValues.value,
    })
    rows.value = page.data
    total.value = page.total
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : String(error)
  } finally {
    isLoading.value = false
  }
}

// Клик по полю в "Добавить фильтр" (новое поле) или по уже существующему чипу
// (донастроить) — в обоих случаях открывает модалку с поиском по значениям.
async function openFilterField(field: string) {
  if (!activeFilterFields.value.includes(field)) {
    activeFilterFields.value = [...activeFilterFields.value, field]
  }
  if (!filterValues.value[field]) {
    filterValues.value = { ...filterValues.value, [field]: [] }
  }
  if (!facetOptions.value[field]) {
    try {
      const options = await fetchFacetValues(field)
      facetOptions.value = { ...facetOptions.value, [field]: options }
    } catch (error) {
      errorText.value = error instanceof Error ? error.message : String(error)
    }
  }
  filterModalSearch.value = ''
  filterModalField.value = field
}

function removeFilterField(field: string) {
  activeFilterFields.value = activeFilterFields.value.filter((f) => f !== field)
  const rest = { ...filterValues.value }
  delete rest[field]
  filterValues.value = rest
  pagination.value = { ...pagination.value, pageIndex: 0 }
}

function clearAllFilters() {
  activeFilterFields.value = []
  filterValues.value = {}
  pagination.value = { ...pagination.value, pageIndex: 0 }
}

function toggleFilterValue(field: string, value: string, checked: boolean) {
  const current = filterValues.value[field] ?? []
  const next = checked ? [...current, value] : current.filter((v) => v !== value)
  filterValues.value = { ...filterValues.value, [field]: next }
  pagination.value = { ...pagination.value, pageIndex: 0 }
}

function facetLabel(field: string, value: string): string {
  return facetOptions.value[field]?.find((o) => o.value === value)?.label ?? value
}

const filteredModalOptions = computed(() => {
  if (!filterModalField.value) return []
  const options = facetOptions.value[filterModalField.value] ?? []
  const query = filterModalSearch.value.trim().toLowerCase()
  if (!query) return options
  return options.filter((o) => o.label.toLowerCase().includes(query))
})

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
// которые меняют несколько ref'ов разом (например смена фильтра сбрасывает ещё
// и pageIndex), бьют дублирующимися запросами вместо одного.
watch([pagination, sorting, search, filterValues], loadPage, { deep: true })
onMounted(loadPage)
</script>

<template>
  <div class="flex flex-1 flex-col gap-4 p-4 md:p-6">
    <p v-if="errorText" class="text-sm text-red-500">{{ errorText }}</p>

    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="relative w-full max-w-xs">
        <Search class="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input v-model="searchInput" placeholder="Поиск по всей таблице…" class="pl-8" />
      </div>

      <div class="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="outline" size="sm">
              <ListFilter />
              <span>Добавить фильтр</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-56">
            <template v-if="filterableFields.filter((f) => !activeFilterFields.includes(f)).length">
              <DropdownMenuItem
                v-for="field in filterableFields.filter((f) => !activeFilterFields.includes(f))"
                :key="field"
                @click="openFilterField(field)"
              >
                {{ columnLabels[field] }}
              </DropdownMenuItem>
            </template>
            <div v-else class="px-2 py-1.5 text-sm text-muted-foreground">Все поля уже добавлены</div>
          </DropdownMenuContent>
        </DropdownMenu>

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
    </div>

    <div v-if="activeFilterFields.length" class="flex flex-wrap items-center gap-2">
      <Button variant="ghost" size="sm" class="text-muted-foreground" @click="clearAllFilters">
        <X class="size-3.5" />
        Очистить
      </Button>
      <div
        v-for="field in activeFilterFields"
        :key="field"
        class="flex items-center gap-1 rounded-md border bg-background py-1 pl-2.5 pr-1 text-sm"
      >
        <button type="button" class="flex min-w-0 items-center gap-1.5 hover:text-foreground/70" @click="openFilterField(field)">
          <span class="font-medium">{{ columnLabels[field] }}:</span>
          <span class="max-w-56 truncate text-muted-foreground">
            {{
              (filterValues[field]?.length ?? 0) > 0
                ? filterValues[field].map((v) => facetLabel(field, v)).join(', ')
                : 'любое значение'
            }}
          </span>
        </button>
        <button type="button" class="shrink-0 rounded-sm p-0.5 hover:bg-muted" @click="removeFilterField(field)">
          <X class="size-3.5" />
          <span class="sr-only">Убрать фильтр «{{ columnLabels[field] }}»</span>
        </button>
      </div>
    </div>

    <Dialog :open="filterModalField !== null" @update:open="(open) => { if (!open) filterModalField = null }">
      <DialogContent class="flex max-h-[85vh] flex-col">
        <DialogHeader>
          <DialogTitle>{{ columnLabels[filterModalField ?? ''] }}</DialogTitle>
          <DialogDescription>Выберите одно или несколько значений</DialogDescription>
        </DialogHeader>
        <div class="relative">
          <Search class="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input v-model="filterModalSearch" placeholder="Поиск значения…" class="pl-8" />
        </div>
        <div class="-mx-1 flex-1 space-y-0.5 overflow-y-auto px-1" style="max-height: 50vh">
          <label
            v-for="option in filteredModalOptions"
            :key="option.value"
            class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
          >
            <Checkbox
              :model-value="(filterValues[filterModalField ?? '']?.includes(option.value)) ?? false"
              @update:model-value="(checked) => toggleFilterValue(filterModalField ?? '', option.value, !!checked)"
            />
            <span class="truncate">{{ option.label }}</span>
          </label>
          <div v-if="!filteredModalOptions.length" class="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <SearchX class="size-6" />
            <span class="text-sm">Ничего не найдено</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="filterModalField = null">Готово</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Card class="min-w-0 gap-0 py-0">
      <div class="overflow-hidden rounded-lg border">
        <div class="overflow-x-auto transition-opacity" :class="{ 'opacity-60': isLoading }">
          <Table class="table-fixed" :style="columnSizeVars">
            <TableHeader class="bg-muted sticky top-0 z-10">
              <TableRow v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
                <TableHead
                  v-for="header in headerGroup.headers"
                  :key="header.id"
                  :colspan="header.colSpan"
                  class="relative select-none border-r border-border/70 last:border-r-0"
                  :style="{ width: `var(--col-${header.column.id}-size)` }"
                >
                  <button
                    v-if="!header.isPlaceholder"
                    type="button"
                    class="flex w-full min-w-0 items-center gap-1.5 hover:text-foreground/80"
                    @click="header.column.toggleSorting(header.column.getIsSorted() === 'asc')"
                  >
                    <span class="truncate"><FlexRender :header="header" /></span>
                    <ArrowUp v-if="header.column.getIsSorted() === 'asc'" class="size-3.5 shrink-0" />
                    <ArrowDown v-else-if="header.column.getIsSorted() === 'desc'" class="size-3.5 shrink-0" />
                    <ArrowUpDown v-else class="size-3.5 shrink-0 text-muted-foreground/50" />
                  </button>
                  <div
                    v-if="header.column.getCanResize()"
                    class="absolute -right-1.5 top-0 z-10 h-full w-3 cursor-col-resize touch-none select-none"
                    @mousedown="header.getResizeHandler()($event)"
                    @touchstart="header.getResizeHandler()($event)"
                  >
                    <div
                      class="mx-auto h-full w-0.5 bg-transparent transition-colors hover:bg-primary"
                      :class="{ 'bg-primary': header.column.getIsResizing() }"
                    />
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <template v-if="table.getRowModel().rows.length">
                <TableRow v-for="row in table.getRowModel().rows" :key="row.id">
                  <TableCell
                    v-for="cell in row.getVisibleCells()"
                    :key="cell.id"
                    class="truncate border-r border-border/70 last:border-r-0"
                    :style="{ width: `var(--col-${cell.column.id}-size)` }"
                    :title="cellTitle(cell.column.id, cell.getValue())"
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
