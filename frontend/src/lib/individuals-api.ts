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

export type IndividualsPage = ListPage<Individual>
export type FetchIndividualsOptions = ListOptions
export type { FacetOption }

export function fetchIndividuals(options: FetchIndividualsOptions): Promise<IndividualsPage> {
  return fetchListPage<Individual>('/individuals', options)
}

export function fetchFacetValues(field: string): Promise<FacetOption[]> {
  return fetchListFacets('/individuals', field)
}
