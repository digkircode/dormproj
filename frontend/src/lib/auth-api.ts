import { apiFetch, apiUrl } from './api-base'

// Стабильные ключи ролей (roles.name в БД, см. backend/src/auth/types.ts) — не для
// отображения. Первый этап ролевой модели: только сами роли и назначение, без своего
// UI управления (см. промпт проекта).
export type RoleName = 'ADMIN' | 'STAFF' | 'RESIDENT'

export interface SessionUser {
  id: number
  surname: string
  name: string
  patronymic: string | null
  email: string
  fullName: string
  // Снимок на момент логина (JWT, TTL 24ч) — смена роли пользователю подхватится
  // не раньше следующего входа, не мгновенно.
  roles: RoleName[]
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
