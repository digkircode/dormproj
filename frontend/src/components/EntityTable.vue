<script setup lang="ts" generic="TData extends RowData">
import { computed, onBeforeUnmount, onMounted, ref, watch, type Component, type Ref } from 'vue'
import type { ColumnDef, ColumnVisibilityState, PaginationState, RowData, SortingState } from '@tanstack/vue-table'
import { FlexRender } from '@tanstack/vue-table'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogScrollContent,
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
import TruncatedCell from '@/components/TruncatedCell.vue'
import { useAppTable, type AppFeatures } from '@/lib/table'
import type { FacetOption, ListOptions, ListPage } from '@/lib/list-api'

const SEARCH_DEBOUNCE_MS = 350

const props = withDefaults(
  defineProps<{
    columns: ColumnDef<AppFeatures, TData, any>[]
    columnLabels: Record<string, string>
    filterableFields: string[]
    defaultSort: { id: string; desc: boolean }
    fetchPage: (options: ListOptions) => Promise<ListPage<TData>>
    fetchFacetValues: (field: string) => Promise<FacetOption[]>
    getRowId: (row: TData) => string
    totalLabel: string
    cellText?: (columnId: string, value: unknown) => string
    pageSizeOptions?: number[]
    hiddenByDefault?: string[]
    // Необязательная колонка-кнопка в конце таблицы — по умолчанию не рендерится,
    // чтобы остальные таблицы не менялись. getHref — ссылка (открыть в новой вкладке),
    // onClick — произвольное действие (открыть модалку и т.п.); передаётся ровно один.
    rowAction?: { icon: Component; label: string; getHref?: (row: TData) => string; onClick?: (row: TData) => void }
  }>(),
  {
    cellText: (_columnId: string, value: unknown) => String(value ?? ''),
    pageSizeOptions: () => [10, 20, 30, 50, 100],
    hiddenByDefault: () => [],
  },
)

// Пусто = видны все колонки (в TanStack отсутствие записи значит "видима", не "скрыта") —
// поэтому "скрыто по умолчанию" выражается явной записью false, а не просто отсутствием.
const columnVisibility = ref<ColumnVisibilityState>(
  Object.fromEntries(props.hiddenByDefault.map((id) => [id, false])),
)
const pagination = ref<PaginationState>({ pageIndex: 0, pageSize: 20 })
const sorting = ref<SortingState>([props.defaultSort])
const searchInput = ref('')
const search = ref('')
const activeFilterFields = ref<string[]>([])
const filterValues = ref<Record<string, string[]>>({})
const facetOptions = ref<Record<string, FacetOption[]>>({})

// Модалка работает с черновиком: пока не нажали "Готово", ничего не применяется
// и фильтр не появляется в списке — иначе просто открыв и закрыв модалку,
// получали бы висящий фильтр "любое значение".
const filterModalField = ref<string | null>(null)
// Отдельно от filterModalField — иначе обнуление поля при закрытии сразу очищает
// filteredModalOptions/заголовок, и модалка на время exit-анимации успевает
// мигнуть пустым состоянием ("Ничего не найдено") и схлопнуться в размере.
const isFilterModalOpen = ref(false)
const filterModalDraft = ref<string[]>([])
const filterModalSearch = ref('')

const state = computed(() => ({
  pagination: pagination.value,
  columnVisibility: columnVisibility.value,
  sorting: sorting.value,
}))

const rows = ref<TData[]>([]) as Ref<TData[]>
const total = ref(0)
const isLoading = ref(false)
const errorText = ref('')

const table = useAppTable({
  columns: props.columns,
  data: rows,
  state,
  getRowId: props.getRowId,
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
    const page = await props.fetchPage({
      page: pagination.value.pageIndex + 1,
      pageSize: pagination.value.pageSize,
      search: search.value,
      sortBy: sort?.id ?? props.defaultSort.id,
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
// (донастроить) — в обоих случаях открывает модалку с черновиком выбора,
// ничего не меняя в применённых фильтрах, пока не подтвердят.
async function openFilterField(field: string) {
  filterModalField.value = field
  filterModalDraft.value = [...(filterValues.value[field] ?? [])]
  if (!facetOptions.value[field]) {
    try {
      const options = await props.fetchFacetValues(field)
      facetOptions.value = { ...facetOptions.value, [field]: options }
    } catch (error) {
      errorText.value = error instanceof Error ? error.message : String(error)
    }
  }
  filterModalSearch.value = ''
  isFilterModalOpen.value = true
}

// Закрытие крестиком/кликом вне/Escape — черновик просто отбрасывается.
// filterModalField намеренно не трогаем — модалка ещё видна во время
// exit-анимации, обнулять данные сейчас означало бы мигнуть пустым состоянием.
function cancelFilterModal() {
  isFilterModalOpen.value = false
}

// Только "Готово" реально применяет фильтр — даже пустой выбор ("любое значение").
function confirmFilterModal() {
  const field = filterModalField.value
  if (!field) return
  if (!activeFilterFields.value.includes(field)) {
    activeFilterFields.value = [...activeFilterFields.value, field]
  }
  filterValues.value = { ...filterValues.value, [field]: filterModalDraft.value }
  pagination.value = { ...pagination.value, pageIndex: 0 }
  isFilterModalOpen.value = false
}

function toggleDraftValue(value: string, checked: boolean) {
  filterModalDraft.value = checked ? [...filterModalDraft.value, value] : filterModalDraft.value.filter((v) => v !== value)
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
  <div class="flex flex-1 flex-col gap-4">
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
      <Button variant="ghost" size="sm" class="ml-auto text-muted-foreground" @click="clearAllFilters">
        <X class="size-3.5" />
        Очистить
      </Button>
    </div>

    <Dialog :open="isFilterModalOpen" @update:open="(open) => { if (!open) cancelFilterModal() }">
      <DialogScrollContent
        class="flex max-h-[85vh] flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
      >
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
              :model-value="filterModalDraft.includes(option.value)"
              @update:model-value="(checked) => toggleDraftValue(option.value, !!checked)"
            />
            <span class="truncate">{{ option.label }}</span>
          </label>
          <div v-if="!filteredModalOptions.length" class="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <SearchX class="size-6" />
            <span class="text-sm">Ничего не найдено</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="confirmFilterModal">Готово</Button>
        </DialogFooter>
      </DialogScrollContent>
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
                  class="relative select-none border-r border-border last:border-r-0"
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
                    class="group absolute -right-1.5 top-0 z-10 h-full w-3 cursor-col-resize touch-none select-none"
                    @mousedown="header.getResizeHandler()($event)"
                    @touchstart="header.getResizeHandler()($event)"
                  >
                    <div
                      class="mx-auto h-full w-0.5 bg-transparent transition-colors group-hover:bg-primary"
                      :class="{ 'bg-primary': header.column.getIsResizing() }"
                    />
                  </div>
                </TableHead>
                <TableHead v-if="rowAction" class="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              <template v-if="table.getRowModel().rows.length">
                <TableRow v-for="row in table.getRowModel().rows" :key="row.id">
                  <TableCell
                    v-for="cell in row.getVisibleCells()"
                    :key="cell.id"
                    class="border-r border-border last:border-r-0"
                    :style="{ width: `var(--col-${cell.column.id}-size)` }"
                  >
                    <TruncatedCell :text="cellText(cell.column.id, cell.getValue())" />
                  </TableCell>
                  <TableCell v-if="rowAction">
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <Button v-if="rowAction.getHref" variant="ghost" size="icon" class="size-7" as-child>
                          <a :href="rowAction.getHref(row.original)" target="_blank" rel="noopener">
                            <component :is="rowAction.icon" />
                            <span class="sr-only">{{ rowAction.label }}</span>
                          </a>
                        </Button>
                        <Button v-else variant="ghost" size="icon" class="size-7" @click="rowAction!.onClick!(row.original)">
                          <component :is="rowAction.icon" />
                          <span class="sr-only">{{ rowAction.label }}</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{{ rowAction.label }}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              </template>
              <TableRow v-else>
                <TableCell :colspan="rowAction ? columns.length + 1 : columns.length" class="h-24 text-center text-muted-foreground">
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
        Всего {{ totalLabel }}: {{ total }}
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
              <SelectItem v-for="pageSize in pageSizeOptions" :key="pageSize" :value="`${pageSize}`">
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
