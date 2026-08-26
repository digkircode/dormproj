import type { Component } from 'vue'
import { Briefcase, ShieldCheck, Tag, User } from 'lucide-vue-next'
import { apiFetch } from './api-base'
import { i18n } from '@/i18n'

export interface Role {
  id: number
  name: string
  _count: { users: number }
}

// Подписи только для 3 системных ролей — только они реально на что-то влияют
// (см. RolesGuard/@Roles() на бэкенде). Роль с незнакомым name (созданная вручную
// через "Добавить роль") отображается как есть, без перевода. Proxy — тот же приём, что
// STATUS_LABELS в contracts-format.ts, реактивен к языку интерфейса.
const KNOWN_ROLE_NAMES = new Set(['ADMIN', 'STAFF', 'RESIDENT'])
export const ROLE_LABELS: Record<string, string> = new Proxy(
  {} as Record<string, string>,
  { get: (_target, name: string) => (KNOWN_ROLE_NAMES.has(name) ? i18n.global.t(`users.role.${name}`) : name) },
)
export function roleLabel(name: string): string {
  return ROLE_LABELS[name] ?? name
}

const ROLE_ICONS: Record<string, Component> = {
  ADMIN: ShieldCheck,
  STAFF: Briefcase,
  RESIDENT: User,
}
// Роль с незнакомым name (созданная вручную через "Добавить роль") — общая иконка-заглушка.
export function roleIcon(name: string): Component {
  return ROLE_ICONS[name] ?? Tag
}

export async function fetchRoles(): Promise<Role[]> {
  const response = await apiFetch('/roles')
  if (!response.ok) {
    throw new Error(i18n.global.t('users.errors.fetchRolesFailed', { status: response.status }))
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
    throw new Error(body.message ?? i18n.global.t('users.errors.createRoleFailed', { status: response.status }))
  }
  return response.json()
}
