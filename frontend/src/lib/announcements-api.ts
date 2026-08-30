import { apiFetch } from './api-base'
import { i18n } from '@/i18n'

export interface StaffAnnouncement {
  id: number
  title: string
  body: string
  authorFullName: string
  createdAt: string
  updatedAt: string
}

export interface ResidentAnnouncement {
  id: number
  title: string
  body: string
  createdAt: string
  updatedAt: string
  unread: boolean
}

export interface AnnouncementInput {
  title: string
  body: string
}

async function parseErrorMessage(response: Response, fallbackKey: string): Promise<string> {
  const body: { message?: string } = await response.json().catch(() => ({}))
  return body.message ?? i18n.global.t(fallbackKey, { status: response.status })
}

// ===== Сотрудники (STAFF/ADMIN) — секция "Объявления" на StaffHomeDashboard.vue =====

export async function fetchAnnouncements(): Promise<StaffAnnouncement[]> {
  const response = await apiFetch('/announcements')
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'announcements.errors.fetchFailed'))
  return response.json()
}

export async function createAnnouncement(input: AnnouncementInput): Promise<{ id: number; createdAt: string }> {
  const response = await apiFetch('/announcements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'announcements.errors.createFailed'))
  return response.json()
}

export async function updateAnnouncement(id: number, input: AnnouncementInput): Promise<void> {
  const response = await apiFetch(`/announcements/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'announcements.errors.updateFailed'))
}

export async function deleteAnnouncement(id: number): Promise<void> {
  const response = await apiFetch(`/announcements/${id}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'announcements.errors.deleteFailed'))
}

// ===== Проживающий — лента на ResidentHomeDashboard.vue =====

export async function fetchMyAnnouncements(): Promise<ResidentAnnouncement[]> {
  const response = await apiFetch('/my-announcements')
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'announcements.errors.fetchFailed'))
  return response.json()
}

export async function markAnnouncementRead(id: number): Promise<void> {
  const response = await apiFetch(`/my-announcements/${id}/read`, { method: 'POST' })
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'announcements.errors.markReadFailed'))
}
