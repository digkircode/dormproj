import { apiFetch } from './api-base'
import type { CharacteristicValueType } from './rooms-api'
import { i18n } from '@/i18n'

export interface RoomCharacteristicDefinition {
  id: number
  name: string
  valueType: CharacteristicValueType
  unit: string | null
  isProtected: boolean
  sortOrder: number
  // Закрытый список допустимых значений — только для valueType TEXT (пусто = обычное
  // свободное поле, как раньше). См. RoomDetailPanel.vue (Select вместо <input>) и
  // RoomCharacteristics.vue (редактирование списка).
  options: string[]
}

export async function fetchDefinitions(): Promise<RoomCharacteristicDefinition[]> {
  const response = await apiFetch('/room-characteristic-definitions')
  if (!response.ok) {
    throw new Error(i18n.global.t('rooms.errors.fetchDefinitionsFailed', { status: response.status }))
  }
  return response.json()
}

export async function createDefinition(input: {
  name: string
  valueType: CharacteristicValueType
  unit?: string | null
  options?: string[]
}): Promise<RoomCharacteristicDefinition> {
  const response = await apiFetch('/room-characteristic-definitions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? i18n.global.t('rooms.errors.createDefinitionFailed', { status: response.status }))
  }
  return response.json()
}

// valueType нельзя поменять после создания (см. бэкенд) — только имя/единица измерения/options.
export async function updateDefinition(
  id: number,
  input: { name?: string; unit?: string | null; options?: string[] },
): Promise<RoomCharacteristicDefinition> {
  const response = await apiFetch(`/room-characteristic-definitions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? i18n.global.t('rooms.errors.updateDefinitionFailed', { status: response.status }))
  }
  return response.json()
}

export async function deleteDefinition(id: number): Promise<void> {
  const response = await apiFetch(`/room-characteristic-definitions/${id}`, { method: 'DELETE' })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? i18n.global.t('rooms.errors.deleteDefinitionFailed', { status: response.status }))
  }
}

// Порядок целиком (id в новом порядке) — из drag-and-drop в таблице, см. RoomCharacteristics.vue.
export async function reorderDefinitions(ids: number[]): Promise<RoomCharacteristicDefinition[]> {
  const response = await apiFetch('/room-characteristic-definitions/reorder', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? i18n.global.t('rooms.errors.reorderFailed', { status: response.status }))
  }
  return response.json()
}
