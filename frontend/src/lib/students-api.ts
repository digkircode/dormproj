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

export async function fetchStudents(page: number, pageSize: number, search: string): Promise<StudentsPage> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (search) {
    params.set('search', search)
  }
  const response = await fetch(apiUrl(`/students?${params}`))
  if (!response.ok) {
    throw new Error(`Не удалось получить список студентов (${response.status})`)
  }
  return response.json()
}
