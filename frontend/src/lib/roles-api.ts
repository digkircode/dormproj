import { apiFetch } from './api-base'

export interface Role {
  id: number
  name: string
  _count: { users: number }
}

// Подписи только для 3 системных ролей — только они реально на что-то влияют
// (см. RolesGuard/@Roles() на бэкенде). Роль с незнакомым name (созданная вручную
// через "Добавить роль") отображается как есть, без перевода.
export const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Администратор',
  STAFF: 'Сотрудник',
  RESIDENT: 'Проживающий',
}
export function roleLabel(name: string): string {
  return ROLE_LABELS[name] ?? name
}

export async function fetchRoles(): Promise<Role[]> {
  const response = await apiFetch('/roles')
  if (!response.ok) {
    throw new Error(`Не удалось получить список ролей (${response.status})`)
  }
  return response.json()
}

export async function createRole(name: string): Promise<Role> {
  const response = await apiFetch('/roles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? `Не удалось создать роль (${response.status})`)
  }
  return response.json()
}
