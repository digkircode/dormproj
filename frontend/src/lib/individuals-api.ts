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
  // Поля ручного ввода (см. schema.prisma) — только у физлиц, заведённых через форму
  // "Новое физическое лицо" или как родитель несовершеннолетнего; у синхронизируемых
  // из 1С физлиц всегда null (их контакты/документы — в contactInfos/passports).
  phone: string | null
  email: string | null
  address: string | null
  passportSeries: string | null
  passportNumber: string | null
  passportIssuedBy: string | null
  passportIssuedCode: string | null
  passportIssuedAt: string | null
  citizenship: string | null
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
    throw new Error(body.message ?? `Не удалось создать физическое лицо (${response.status})`)
  }
  return response.json()
}

export async function fetchIndividualDetail(uid: string): Promise<IndividualDetail> {
  const response = await apiFetch(`/individuals/${encodeURIComponent(uid)}`)
  if (!response.ok) {
    throw new Error(`Не удалось получить данные физлица (${response.status})`)
  }
  return response.json()
}

// "Критическая правка" — пишет напрямую в синхронные таблицы (ContactInfo/Passport/
// Citizenship), не в manual-поля Individual (см. backend/src/individuals/individual-edit.ts).
// Осознанный аварийный костыль: ближайший ночной синхрон синхронизируемых физлиц
// перезапишет эти значения обратно из 1С — это ожидаемо, не баг.
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
    throw new Error(body.message ?? `Не удалось сохранить изменения (${response.status})`)
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
    throw new Error(`Не удалось получить историю изменений (${response.status})`)
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

// Кнопка "Синхронизировать" на карточке — единственное место, откуда запускается
// этот синхрон (см. бэкенд: у него нет общего /sync/individual без UID).
export async function syncIndividual(uid: string): Promise<IndividualSyncResult> {
  const response = await apiFetch(`/individuals/${encodeURIComponent(uid)}/sync`, { method: 'POST' })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? `Не удалось синхронизировать физлицо (${response.status})`)
  }
  return response.json()
}
