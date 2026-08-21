import { apiFetch } from './api-base'
import { fetchListPage, fetchListFacets, type ListOptions, type ListPage, type FacetOption } from './list-api'
import type { Role } from './roles-api'

export interface UserRow {
  id: number
  fullName: string
  email: string | null
  roles: Role[]
}

export function fetchUsersPage(options: ListOptions): Promise<ListPage<UserRow>> {
  return fetchListPage<UserRow>('/users', options)
}
export function fetchUsersFacets(field: string): Promise<FacetOption[]> {
  return fetchListFacets('/users', field)
}

// Ищет среди ВСЕХ пользователей (не только уже имеющих роль, см. бэкенд) — для
// диалога выдачи роли: нужно найти в том числе того, у кого роли ещё нет.
export async function searchUsers(q: string): Promise<UserRow[]> {
  if (!q.trim()) return []
  const response = await apiFetch(`/users/search?q=${encodeURIComponent(q)}`)
  if (!response.ok) {
    throw new Error(`Не удалось найти пользователей (${response.status})`)
  }
  return response.json()
}

export async function grantRole(userId: number, roleId: number): Promise<UserRow> {
  const response = await apiFetch(`/users/${userId}/roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roleId }),
  })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? `Не удалось выдать роль (${response.status})`)
  }
  return response.json()
}

export async function revokeRole(userId: number, roleId: number): Promise<UserRow> {
  const response = await apiFetch(`/users/${userId}/roles/${roleId}`, { method: 'DELETE' })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? `Не удалось отозвать роль (${response.status})`)
  }
  return response.json()
}
