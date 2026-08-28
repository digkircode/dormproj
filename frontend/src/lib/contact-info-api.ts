import { fetchListPage, fetchListFacets, type ListOptions, type ListPage, type FacetOption } from './list-api'

export interface ContactInfo {
  id: number
  fizicheskoyeLitsoUid: string
  fullName: string
  type: string
  predstavleniye: string
  xml: string
  json: string
  country: string
  region: string
  city: string
  email: string
  phoneNumber: string
  phoneNumberNoCode: string
  dateStart: string
  createdAt: string
}

export type ContactInfoPage = ListPage<ContactInfo>
export type FetchContactInfoOptions = ListOptions
export type { FacetOption }

export function fetchContactInfo(options: FetchContactInfoOptions, signal?: AbortSignal): Promise<ContactInfoPage> {
  return fetchListPage<ContactInfo>('/contact-info', options, undefined, signal)
}

export function fetchFacetValues(field: string): Promise<FacetOption[]> {
  return fetchListFacets('/contact-info', field)
}
