<script setup lang="ts" generic="TData extends RowData">
import { computed, onBeforeUnmount, onMounted, ref, watch, type Component, type Ref } from 'vue'
import type { ColumnDef, ColumnSizingState, ColumnVisibilityState, PaginationState, RowData, SortingState } from '@tanstack/vue-table'
import { FlexRender } from '@tanstack/vue-table'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
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
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
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
    // Кастомный рендер конкретной колонки (иконка статуса и т.п.) вместо обычного текста —
    // по умолчанию нет ни у одной колонки, остальные таблицы рендерятся как раньше.
    // Компонент получает пропы value (cell.getValue()) и row (row.original).
    cellRenderers?: Record<string, Component>
    pageSizeOptions?: number[]
    hiddenByDefault?: string[]
    // Необязательная колонка-кнопка в конце таблицы — по умолчанию не рендерится,
    // чтобы остальные таблицы не менялись. getHref — внутренний роут, рендерится как
    // RouterLink (обычный клик — переход внутри SPA без перезагрузки, колёсико/Ctrl+клик —
    // родное поведение браузера, новая вкладка), onClick — произвольное действие
    // (открыть модалку и т.п.); передаётся ровно один.
    rowAction?: { icon: Component; label: string; getHref?: (row: TData) => string; onClick?: (row: TData) => void }
    // Если задан — видимость колонок и сортировка сохраняются в localStorage под этим
    // ключом и восстанавливаются при следующем визите. Без ключа поведение как раньше.
    storageKey?: string
    // Красит основные иконки таблицы (фильтр, настройка, кнопка rowAction) в text-primary —
    // опционально. Остальные хромовые иконки (сортировка/пагинация/шеврон настройки/крестики
    // фильтров) в accentIcons намеренно не входят, как и поиск и статусные ячейки (cellRenderers).
    accentIcons?: boolean
  }>(),
  {
    cellText: (_columnId: string, value: unknown) => String(value ?? ''),
    pageSizeOptions: () => [10, 20, 30, 50, 100],
    hiddenByDefault: () => [],
  },
)

const emit = defineEmits<{ loaded: [rows: TData[]] }>()

const STORAGE_PREFIX = 'entity-table:'

function readStoredTableState(): { columnVisibility?: ColumnVisibilityState; sorting?: SortingState } | null {
  if (!props.storageKey) return null
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + props.storageKey)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const storedTableState = readStoredTableState()

// Пусто = видны все колонки (в TanStack отсутствие записи значит "видима", не "скрыта") —
// поэтому "скрыто по умолчанию" выражается явной записью false, а не просто отсутствием.
const columnVisibility = ref<ColumnVisibilityState>(
  storedTableState?.columnVisibility ?? Object.fromEntries(props.hiddenByDefault.map((id) => [id, false])),
)
const pagination = ref<PaginationState>({ pageIndex: 0, pageSize: 20 })
const sorting = ref<SortingState>(storedTableState?.sorting ?? [props.defaultSort])
// columnSizing по умолчанию — неконтролируемое внутреннее состояние TanStack (не Vue ref),
// наш computed на CSS-переменные его изменений не видит — без явного onColumnSizingChange
// ресайз колонок визуально не работает (состояние обновляется, но рендер не реагирует).
const columnSizing = ref<ColumnSizingState>({})
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
  columnSizing: columnSizing.value,
}))

const rows = ref<TData[]>([]) as Ref<TData[]>
const total = ref(0)
// true с самого начала — иначе на первом кадре (до onMounted) пустые rows[] на миг
// показывают "Ничего не найдено" вместо "Загрузка…".
const isLoading = ref(true)
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
  onColumnSizingChange: (updater) => {
    columnSizing.value = typeof updater === 'function' ? updater(columnSizing.value) : updater
  },
})

// CSS-переменные на ширины колонок вместо чтения column.getSize() в каждой ячейке —
// при live-перетаскивании (columnResizeMode: onChange) это заметно дешевле.
//
// В процентах от ширины таблицы, а не в сырых пикселях из getSize() — иначе именно
// во время "Загрузка…" (тело — один <td colspan>, а не по ячейке на колонку) браузер
// не может пропорционально растянуть колонки под фактическую ширину таблицы (w-full)
// и рисует <th> буквально по объявленным px (сумма < ширины контейнера, колонки уже
// строк с данными) — это и есть "дёрганье", подтверждено замером getBoundingClientRect
// в debug-харнессе: 256/128/192 при загрузке против 425/212/319 после. В процентах
// результат идентичен в обоих состояниях, потому что не зависит от структуры тела.
//
// Чистый calc(100% * fraction) — БЕЗ вычитания (calc((100% - Xrem) * fraction)) и без
// фиксированной px/rem-колонки среди процентных соседей: смешение ломает резолвинг
// ширины <col> под table-layout:fixed (все колонки схлопываются в одинаковую ширину,
// подтверждено замером — резерв под rowAction тоже приходится выражать долей, а не rem).
const ROW_ACTION_UNITS = 48
const columnSizeVars = computed(() => {
  const headers = table.getFlatHeaders()
  const dataTotal = headers.reduce((sum, header) => sum + header.getSize(), 0) || 1
  const totalSize = props.rowAction ? dataTotal + ROW_ACTION_UNITS : dataTotal
  const vars: Record<string, string> = {}
  for (const header of headers) {
    const fraction = header.getSize() / totalSize
    vars[`--col-${header.column.id}-size`] = `calc(100% * ${fraction})`
  }
  if (props.rowAction) {
    vars['--col-row-action-size'] = `calc(100% * ${ROW_ACTION_UNITS / totalSize})`
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
    emit('loaded', page.data)
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

// Только видимость колонок и сортировка — страница/поиск/фильтры каждый раз с чистого
// листа, иначе можно неожиданно "приземлиться" на середине списка при следующем визите.
watch([columnVisibility, sorting], () => {
  if (!props.storageKey) return
  try {
    localStorage.setItem(
      STORAGE_PREFIX + props.storageKey,
      JSON.stringify({ columnVisibility: columnVisibility.value, sorting: sorting.value }),
    )
  } catch {
    // localStorage может быть недоступен (приватный режим и т.п.) — просто не сохраняем
  }
}, { deep: true })

defineExpose({ refresh: loadPage })
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4">
    <p v-if="errorText" class="text-sm text-red-500">{{ errorText }}</p>

    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="relative w-full max-w-xs">
        <Search class="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input v-model="searchInput" placeholder="Поиск по всей таблице…" class="pl-8" />
      </div>

      <div class="flex items-center gap-2">
        <slot name="actions" />

        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="outline" size="icon" title="Добавить фильтр">
              <ListFilter :class="{ 'text-primary': accentIcons }" />
              <span class="sr-only">Добавить фильтр</span>
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
            <Button variant="outline" size="icon" title="Настройка таблицы">
              <Settings2 :class="{ 'text-primary': accentIcons }" />
              <span class="sr-only">Настройка таблицы</span>
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

    <Card class="flex min-h-0 min-w-0 flex-1 flex-col gap-0 py-0">
      <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
        <!-- Шапка — отдельная от тела таблица, не участвующая в скролле, а не sticky
             внутри общего скролл-контейнера: у sticky скроллбар всё равно тянется на всю
             высоту контейнера (проходит мимо шапки, просто визуально перекрываясь ей),
             а тут скроллится только контейнер тела ниже — скроллбар физически начинается
             под шапкой. Ширины колонок общие через --col-*-size (columnSizeVars), поэтому
             колонки в обеих таблицах всегда совпадают, включая live-ресайз. -->
        <table class="w-full table-fixed caption-bottom text-sm" :style="columnSizeVars">
          <colgroup>
            <col v-for="header in table.getFlatHeaders()" :key="header.id" :style="{ width: `var(--col-${header.column.id}-size)` }" />
            <col v-if="rowAction" :style="{ width: 'var(--col-row-action-size)' }" />
          </colgroup>
          <TableHeader class="bg-muted">
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
              <TableHead v-if="rowAction" :style="{ width: 'var(--col-row-action-size)' }" />
            </TableRow>
          </TableHeader>
        </table>
        <div class="min-h-0 flex-1 overflow-auto transition-opacity" :class="{ 'opacity-60': isLoading }">
          <table class="w-full table-fixed caption-bottom text-sm" :style="columnSizeVars">
            <!-- table-layout: fixed по спецификации должен брать ширины колонок из первой
                 строки, но во время загрузки тело — один <td colspan> без индивидуальных
                 ширин, и часть браузеров в этот момент пересчитывает ширины иначе, чем когда
                 в строках уже есть реальные ячейки — колонки визуально "прыгают". colgroup
                 задаёт ширины явно и не зависит от содержимого строк вообще. -->
            <colgroup>
              <col v-for="header in table.getFlatHeaders()" :key="header.id" :style="{ width: `var(--col-${header.column.id}-size)` }" />
              <col v-if="rowAction" :style="{ width: 'var(--col-row-action-size)' }" />
            </colgroup>
            <TableBody>
              <template v-if="table.getRowModel().rows.length">
                <TableRow v-for="row in table.getRowModel().rows" :key="row.id">
                  <TableCell
                    v-for="cell in row.getVisibleCells()"
                    :key="cell.id"
                    class="border-r border-border last:border-r-0"
                    :style="{ width: `var(--col-${cell.column.id}-size)` }"
                  >
                    <component
                      :is="cellRenderers[cell.column.id]"
                      v-if="cellRenderers?.[cell.column.id]"
                      :value="cell.getValue()"
                      :row="row.original"
                    />
                    <TruncatedCell v-else :text="cellText(cell.column.id, cell.getValue())" />
                  </TableCell>
                  <TableCell v-if="rowAction" class="p-2 text-center" :style="{ width: 'var(--col-row-action-size)' }">
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <Button v-if="rowAction.getHref" variant="ghost" size="icon" class="size-7" as-child>
                          <RouterLink :to="rowAction.getHref(row.original)">
                            <component :is="rowAction.icon" :class="{ 'text-primary': accentIcons }" />
                            <span class="sr-only">{{ rowAction.label }}</span>
                          </RouterLink>
                        </Button>
                        <Button v-else variant="ghost" size="icon" class="size-7" @click="rowAction!.onClick!(row.original)">
                          <component :is="rowAction.icon" :class="{ 'text-primary': accentIcons }" />
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
          </table>
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
