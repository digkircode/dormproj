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

// Полноценный logout: и dormproj, и сама сессия на rosnou-id — иначе следующий
// вход тут же залогинит обратно без формы (см. auth.controller.ts на бэкенде).
export function rosnouLogoutUrl(): string {
  return apiUrl('/auth/rosnou/logout')
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
