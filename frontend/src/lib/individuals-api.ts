import { apiFetch } from './api-base'
import { fetchListPage, fetchListFacets, type ListOptions, type ListPage, type FacetOption } from './list-api'

export interface Individual {
  fizicheskoyeLitsoUid: string
  deleteMark: boolean
  code: string | null
  fullName: string
  surname: string | null
  name: string | null
  otchestvo: string | null
  gender: string | null
  birthDate: string | null
  inn: string | null
  snils: string | null
  photoCode: string | null
  isManual: boolean
  createdAt: string
  updatedAt: string
}

export interface IndividualCitizenship {
  id: number
  period: string
  country: string
  countryCode: string
}

export interface IndividualPassport {
  id: number
  period: string
  type: string
  series: string
  number: string
  dateStart: string
  unit: string
  codeUnit: string
  systemDoc: string
}

// citizenships — максимум один элемент (последний по period, см. бэкенд), passports —
// все документы, отсортированы так, что первый в списке и есть актуальный.
export interface IndividualDetail extends Individual {
  citizenships: IndividualCitizenship[]
  passports: IndividualPassport[]
}

export type IndividualsPage = ListPage<Individual>
export type FetchIndividualsOptions = ListOptions
export type { FacetOption }

export function fetchIndividuals(options: FetchIndividualsOptions): Promise<IndividualsPage> {
  return fetchListPage<Individual>('/individuals', options)
}

export function fetchFacetValues(field: string): Promise<FacetOption[]> {
  return fetchListFacets('/individuals', field)
}

export async function fetchIndividualDetail(uid: string): Promise<IndividualDetail> {
  const response = await apiFetch(`/individuals/${encodeURIComponent(uid)}`)
  if (!response.ok) {
    throw new Error(`Не удалось получить данные физлица (${response.status})`)
  }
  return response.json()
}
