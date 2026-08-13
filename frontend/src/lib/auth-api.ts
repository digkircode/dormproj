import { apiFetch, apiUrl } from './api-base'

export interface SessionUser {
  id: number
  surname: string
  name: string
  patronymic: string | null
  email: string
  fullName: string
}

export function rosnouLoginUrl(): string {
  return apiUrl('/auth/rosnou/login')
}

// null означает "не авторизован" — это ожидаемый, не ошибочный исход.
export async function fetchCurrentUser(): Promise<SessionUser | null> {
  const response = await apiFetch('/auth/me')
  if (response.status === 401) {
    return null
  }
  if (!response.ok) {
    throw new Error(`Не удалось получить данные пользователя (${response.status})`)
  }
  return response.json()
}

export async function logout(): Promise<void> {
  const response = await apiFetch('/auth/logout', { method: 'POST' })
  if (!response.ok) {
    throw new Error(`Не удалось выйти (${response.status})`)
  }
}
