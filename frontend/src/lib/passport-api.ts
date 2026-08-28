import { fetchListPage, fetchListFacets, type ListOptions, type ListPage, type FacetOption } from './list-api'

export interface Passport {
  id: number
  fizicheskoyeLitsoUid: string
  fullName: string
  period: string
  type: string
  series: string
  number: string
  dateStart: string
  unit: string
  codeUnit: string
  systemDoc: string
  createdAt: string
}

export type PassportsPage = ListPage<Passport>
export type FetchPassportOptions = ListOptions
export type { FacetOption }

export function fetchPassports(options: FetchPassportOptions, signal?: AbortSignal): Promise<PassportsPage> {
  return fetchListPage<Passport>('/passport', options, undefined, signal)
}

export function fetchFacetValues(field: string): Promise<FacetOption[]> {
  return fetchListFacets('/passport', field)
}
