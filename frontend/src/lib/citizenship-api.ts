import { fetchListPage, fetchListFacets, type ListOptions, type ListPage, type FacetOption } from './list-api'

export interface Citizenship {
  id: number
  fizicheskoyeLitsoUid: string
  fullName: string
  period: string
  country: string
  countryCode: string
  createdAt: string
}

export type CitizenshipPage = ListPage<Citizenship>
export type FetchCitizenshipOptions = ListOptions
export type { FacetOption }

export function fetchCitizenship(options: FetchCitizenshipOptions): Promise<CitizenshipPage> {
  return fetchListPage<Citizenship>('/citizenship', options)
}

export function fetchFacetValues(field: string): Promise<FacetOption[]> {
  return fetchListFacets('/citizenship', field)
}
