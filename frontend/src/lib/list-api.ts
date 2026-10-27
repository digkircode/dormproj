import { apiFetch } from './api-base'
import { i18n } from '@/i18n'

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
    throw new Error(i18n.global.t('errors.fetchListFailed', { status: response.status }))
  }
  return response.json()
}

export async function fetchListFacets(basePath: string, field: string, extra?: Record<string, string>): Promise<FacetOption[]> {
  const params = new URLSearchParams(extra)
  const query = params.size ? `?${params}` : ''
  const response = await apiFetch(`${basePath}/facets/${encodeURIComponent(field)}${query}`)
  if (!response.ok) {
    throw new Error(i18n.global.t('errors.fetchFacetsFailed', { status: response.status }))
  }
  return response.json()
}
