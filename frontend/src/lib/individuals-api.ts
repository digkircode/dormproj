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

export interface IndividualContactInfo {
  id: number
  type: string
  predstavleniye: string
  dateStart: string
}

export interface IndividualStudent {
  zachetnayaKnigaUid: string
  zachetnayaKniga: string
  uchebYear: string
  uchebPlan: string
  uchebPlanOsnova: string
  formObuch: string
  facultet: string
  speciality: string
  kurs: string
  group: string
  uchebStatus: string
  osnovaObuch: string
  urovenPodgotov: string
  profilSpec: string | null
  dot: boolean
  facultAbbr: string
  period: string
}

// citizenships — максимум один элемент (последний по period, см. бэкенд), passports —
// все документы, отсортированы так, что первый в списке и есть актуальный. contactInfos —
// по одной (самой актуальной) записи на каждый встретившийся Type, см. pickLatestContactInfo
// на бэкенде. students — все зачётные книжки физлица (может быть несколько за разные периоды).
export interface IndividualDetail extends Individual {
  citizenships: IndividualCitizenship[]
  passports: IndividualPassport[]
  contactInfos: IndividualContactInfo[]
  students: IndividualStudent[]
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
