import { apiFetch, apiUrl } from './api-base'
import { i18n } from '@/i18n'

export type RoleName = 'ADMIN' | 'STAFF' | 'RESIDENT'

export interface SessionUser {
  id: number
  surname: string
  name: string
  patronymic: string | null
  email: string
  fullName: string
  roles: RoleName[]
}

export function rosnouLoginUrl(): string {
  return apiUrl('/auth/rosnou/login')
}

export function rosnouLogoutUrl(): string {
  return apiUrl('/auth/rosnou/logout')
}

export async function fetchCurrentUser(): Promise<SessionUser | null> {
  const response = await apiFetch('/auth/me', { signal: AbortSignal.timeout(15000) })
  if (response.status === 401) {
    return null
  }
  if (!response.ok) {
    throw new Error(i18n.global.t('errors.fetchUserFailed', { status: response.status }))
  }
  return response.json()
}
