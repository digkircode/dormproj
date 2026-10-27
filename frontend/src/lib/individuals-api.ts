import { apiFetch } from './api-base'
import { i18n } from '@/i18n'
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
  phone: string | null
  email: string | null
  address: string | null
  passportSeries: string | null
  passportNumber: string | null
  passportIssuedBy: string | null
  passportIssuedCode: string | null
  passportIssuedAt: string | null
  citizenship: string | null
  mergedIntoUid: string | null
  mergedAt: string | null
  createdAt: string
  updatedAt: string
  accounting1cContractorUid: string | null
  accounting1cMatched: boolean
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

export interface IndividualMergedFrom {
  fizicheskoyeLitsoUid: string
  fullName: string
  mergedAt: string | null
}

export interface IndividualDetail extends Individual {
  accountingMappingNeedsReview?: boolean
  citizenships: IndividualCitizenship[]
  passports: IndividualPassport[]
  contactInfos: IndividualContactInfo[]
  students: IndividualStudent[]
  mergedFrom: IndividualMergedFrom[]
}

export type IndividualsPage = ListPage<Individual>
export type FetchIndividualsOptions = ListOptions
export type { FacetOption }

export function fetchIndividuals(options: FetchIndividualsOptions, signal?: AbortSignal): Promise<IndividualsPage> {
  return fetchListPage<Individual>('/individuals', options, undefined, signal)
}

export function fetchFacetValues(field: string): Promise<FacetOption[]> {
  return fetchListFacets('/individuals', field)
}

export interface CreateIndividualInput {
  surname: string
  name: string
  otchestvo?: string | null
  birthDate: string
  gender: 'Мужской' | 'Женский'
  citizenship: string
  phone: string
  email?: string | null
  address: string
  snils?: string | null
  inn?: string | null
  passportSeries?: string | null
  passportNumber: string
  passportIssuedBy?: string | null
  passportIssuedCode?: string | null
  passportIssuedAt: string
}

export async function createIndividual(input: CreateIndividualInput): Promise<Individual> {
  const response = await apiFetch('/individuals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? i18n.global.t('individuals.apiErrors.createFailed', { status: response.status }))
  }
  return response.json()
}

export async function fetchIndividualDetail(uid: string): Promise<IndividualDetail> {
  const response = await apiFetch(`/individuals/${encodeURIComponent(uid)}`)
  if (!response.ok) {
    throw new Error(i18n.global.t('individuals.apiErrors.fetchFailed', { status: response.status }))
  }
  return response.json()
}

export async function updateIndividualAccounting1cMapping(uid: string, contractorUid: string | null): Promise<IndividualDetail> {
  const response = await apiFetch(`/individuals/${encodeURIComponent(uid)}/accounting-1c-mapping`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contractorUid }),
  })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? i18n.global.t('individuals.apiErrors.mappingFailed', { status: response.status }))
  }
  return response.json()
}

export interface UpdateIndividualInput {
  surname: string
  name: string
  otchestvo?: string | null
  birthDate: string
  gender: 'Мужской' | 'Женский'
  citizenship: string
  birthPlace?: string | null
  registrationAddress?: string | null
  residenceAddress?: string | null
  phone?: string | null
  email?: string | null
  snils?: string | null
  inn?: string | null
  passportSeries?: string | null
  passportNumber?: string | null
  passportIssuedBy?: string | null
  passportIssuedCode?: string | null
  passportIssuedAt?: string | null
}

export async function updateIndividual(uid: string, input: UpdateIndividualInput): Promise<IndividualDetail> {
  const response = await apiFetch(`/individuals/${encodeURIComponent(uid)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? i18n.global.t('individuals.apiErrors.updateFailed', { status: response.status }))
  }
  return response.json()
}

export interface IndividualAuditLogEntry {
  id: number
  userFullName: string
  action: 'CREATE' | 'UPDATE' | 'DELETE'
  changes: Record<string, { before: unknown; after: unknown }> | null
  createdAt: string
}

export async function fetchIndividualAuditLog(uid: string): Promise<IndividualAuditLogEntry[]> {
  const response = await apiFetch(`/individuals/${encodeURIComponent(uid)}/audit-log`)
  if (!response.ok) {
    throw new Error(i18n.global.t('individuals.apiErrors.historyFailed', { status: response.status }))
  }
  return response.json()
}

export interface IndividualSyncResult {
  status: 'SUCCESS'
  fetchedCount: number
  added: number
  updated: number
  removed: number
  startedAt: string
  finishedAt: string
}

export async function syncIndividual(uid: string): Promise<IndividualSyncResult> {
  const response = await apiFetch(`/individuals/${encodeURIComponent(uid)}/sync`, { method: 'POST' })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? i18n.global.t('individuals.apiErrors.syncFailed', { status: response.status }))
  }
  return response.json()
}

export interface IndividualMergeCandidate {
  fizicheskoyeLitsoUid: string
  fullName: string
  snils: string | null
  birthDate: string | null
  code: string | null
}

export async function fetchIndividualMergeCandidates(uid: string): Promise<IndividualMergeCandidate[]> {
  const response = await apiFetch(`/individuals/${encodeURIComponent(uid)}/merge-candidates`)
  if (!response.ok) {
    throw new Error(i18n.global.t('individuals.apiErrors.mergeCandidatesFailed', { status: response.status }))
  }
  return response.json()
}

export async function mergeIndividual(uid: string, targetUid: string): Promise<IndividualDetail> {
  const response = await apiFetch(`/individuals/${encodeURIComponent(uid)}/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetUid }),
  })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? i18n.global.t('individuals.apiErrors.mergeFailed', { status: response.status }))
  }
  return response.json()
}

export async function unmergeIndividual(uid: string): Promise<IndividualDetail> {
  const response = await apiFetch(`/individuals/${encodeURIComponent(uid)}/unmerge`, { method: 'POST' })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? i18n.global.t('individuals.apiErrors.unmergeFailed', { status: response.status }))
  }
  return response.json()
}
