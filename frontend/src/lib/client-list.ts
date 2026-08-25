import type { FacetOption, ListOptions, ListPage } from './list-api'

// EntityTable.vue построена вокруг серверной пагинации (fetchPage всегда бьёт по сети) —
// для полностью загруженного в память массива (начисления/платежи одного резидента,
// GET /my-payments и GET /my-contract уже отдают их разом, без постраничности) готового
// клиентского адаптера в проекте не было (см. промпт задачи, MyContract.vue — первая
// такая таблица, добавлено 2026-08-26). Здесь — тот же контракт ListOptions/ListPage,
// но поиск/фильтр/сортировка/пагинация считаются локально, без единого сетевого запроса.
export interface ClientListConfig<T> {
  searchText: (item: T) => string
  sortValue: (item: T, sortBy: string) => string | number
  filterValue?: (item: T, field: string) => string
}

export function createClientFetchPage<T>(getItems: () => T[], config: ClientListConfig<T>): (options: ListOptions) => Promise<ListPage<T>> {
  return async (options: ListOptions) => {
    let list = getItems()

    if (config.filterValue) {
      for (const [field, values] of Object.entries(options.filters)) {
        if (values.length === 0) continue
        list = list.filter((item) => values.includes(config.filterValue!(item, field)))
      }
    }

    const search = options.search.trim().toLowerCase()
    if (search) {
      list = list.filter((item) => config.searchText(item).toLowerCase().includes(search))
    }

    if (options.sortBy) {
      const sorted = [...list].sort((a, b) => {
        const av = config.sortValue(a, options.sortBy)
        const bv = config.sortValue(b, options.sortBy)
        if (av < bv) return -1
        if (av > bv) return 1
        return 0
      })
      list = options.sortDir === 'desc' ? sorted.reverse() : sorted
    }

    const total = list.length
    const start = (options.page - 1) * options.pageSize
    return { data: list.slice(start, start + options.pageSize), total, page: options.page, pageSize: options.pageSize }
  }
}

export function createClientFacetValues<T>(
  getItems: () => T[],
  filterValue: (item: T, field: string) => string,
  labelFor?: (field: string, value: string) => string,
): (field: string) => Promise<FacetOption[]> {
  return async (field: string) => {
    const values = new Set(getItems().map((item) => filterValue(item, field)))
    return [...values].map((value) => ({ value, label: labelFor ? labelFor(field, value) : value }))
  }
}
