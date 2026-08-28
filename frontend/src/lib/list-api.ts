import { apiFetch } from './api-base'

export interface ListOptions {
  page: number
  pageSize: number
  search: string
  sortBy: string
  sortDir: 'asc' | 'desc'
  filters: Record<string, string[]>
}

export interface ListPage<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

export interface FacetOption {
  value: string
  label: string
}

// Общая форма списочных эндпоинтов бэкенда: GET basePath?page=&pageSize=&search=&sortBy=&sortDir=&filters=[&extra]
// extra — доп. параметры вроде asOf/from/to, которые EntityTable сама не знает (не часть
// ListOptions) — родительская страница добавляет их сама, тот же приём, что уже был у
// fetchMovementsPage, вынесен сюда, когда понадобился ещё в паре мест.
// signal — опциональный AbortSignal (см. EntityTable.vue#loadPage): отменяет предыдущий
// запрос при быстрой смене фильтров/сортировки/страницы, чтобы устаревший ответ не
// перезаписал уже актуальные данные (была известная гонка, см. промпт проекта).
export async function fetchListPage<T>(
  basePath: string,
  options: ListOptions,
  extra?: Record<string, string>,
  signal?: AbortSignal,
): Promise<ListPage<T>> {
  const params = new URLSearchParams({
    page: String(options.page),
    pageSize: String(options.pageSize),
    sortBy: options.sortBy,
    sortDir: options.sortDir,
    ...extra,
  })
  if (options.search) {
    params.set('search', options.search)
  }
  const activeFilters = Object.fromEntries(Object.entries(options.filters).filter(([, values]) => values.length > 0))
  if (Object.keys(activeFilters).length > 0) {
    params.set('filters', JSON.stringify(activeFilters))
  }
  const response = await apiFetch(`${basePath}?${params}`, { signal })
  if (!response.ok) {
    throw new Error(`Не удалось получить данные (${response.status})`)
  }
  return response.json()
}

// Общая форма фасетов: GET basePath/facets/:field
export async function fetchListFacets(basePath: string, field: string): Promise<FacetOption[]> {
  const response = await apiFetch(`${basePath}/facets/${encodeURIComponent(field)}`)
  if (!response.ok) {
    throw new Error(`Не удалось получить значения для фильтра (${response.status})`)
  }
  return response.json()
}
