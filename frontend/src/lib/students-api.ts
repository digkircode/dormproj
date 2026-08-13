import { fetchListPage, fetchListFacets, type ListOptions, type ListPage, type FacetOption } from './list-api'

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

export type StudentsPage = ListPage<Student>
export type FetchStudentsOptions = ListOptions
export type { FacetOption }

export function fetchStudents(options: FetchStudentsOptions): Promise<StudentsPage> {
  return fetchListPage<Student>('/students', options)
}

export function fetchFacetValues(field: string): Promise<FacetOption[]> {
  return fetchListFacets('/students', field)
}
