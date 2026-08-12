import { apiUrl } from './api-base'

export interface Student {
  zachetnayaKnigaUid: string
  fizicheskoyeLitsoUid: string
  fullName: string
  zachetnayaKniga: string
  uchebYear: string
  uchebPlan: string
  uchebPlanOsnova: string
  formObuch: string
  facultet: string
  speciality: string
  kurs: string
  kursNumber: number
  group: string
  uchebStatus: string
  osnovaObuch: string
  urovenPodgotov: string
  profilSpec: string | null
  dot: boolean
  facultAbbr: string
  period: string
  createdAt: string
  updatedAt: string
}

export interface StudentsPage {
  data: Student[]
  total: number
  page: number
  pageSize: number
}

export interface FetchStudentsOptions {
  page: number
  pageSize: number
  search: string
  sortBy: string
  sortDir: 'asc' | 'desc'
  filters: Record<string, string[]>
}

export async function fetchStudents(options: FetchStudentsOptions): Promise<StudentsPage> {
  const params = new URLSearchParams({
    page: String(options.page),
    pageSize: String(options.pageSize),
    sortBy: options.sortBy,
    sortDir: options.sortDir,
  })
  if (options.search) {
    params.set('search', options.search)
  }
  const activeFilters = Object.fromEntries(Object.entries(options.filters).filter(([, values]) => values.length > 0))
  if (Object.keys(activeFilters).length > 0) {
    params.set('filters', JSON.stringify(activeFilters))
  }
  const response = await fetch(apiUrl(`/students?${params}`))
  if (!response.ok) {
    throw new Error(`Не удалось получить список студентов (${response.status})`)
  }
  return response.json()
}

export interface FacetOption {
  value: string
  label: string
}

export async function fetchFacetValues(field: string): Promise<FacetOption[]> {
  const response = await fetch(apiUrl(`/students/facets/${encodeURIComponent(field)}`))
  if (!response.ok) {
    throw new Error(`Не удалось получить значения для фильтра (${response.status})`)
  }
  return response.json()
}
