import { apiFetch } from './api-base'
import type { CharacteristicValueType } from './rooms-api'

export interface RoomCharacteristicDefinition {
  id: number
  name: string
  valueType: CharacteristicValueType
  unit: string | null
  isProtected: boolean
}

export async function fetchDefinitions(): Promise<RoomCharacteristicDefinition[]> {
  const response = await apiFetch('/room-characteristic-definitions')
  if (!response.ok) {
    throw new Error(`Не удалось получить список характеристик (${response.status})`)
  }
  return response.json()
}

export async function createDefinition(input: {
  name: string
  valueType: CharacteristicValueType
  unit?: string | null
}): Promise<RoomCharacteristicDefinition> {
  const response = await apiFetch('/room-characteristic-definitions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? `Не удалось создать характеристику (${response.status})`)
  }
  return response.json()
}

// valueType нельзя поменять после создания (см. бэкенд) — только имя/единица измерения.
export async function updateDefinition(id: number, input: { name?: string; unit?: string | null }): Promise<RoomCharacteristicDefinition> {
  const response = await apiFetch(`/room-characteristic-definitions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? `Не удалось изменить характеристику (${response.status})`)
  }
  return response.json()
}

export async function deleteDefinition(id: number): Promise<void> {
  const response = await apiFetch(`/room-characteristic-definitions/${id}`, { method: 'DELETE' })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? `Не удалось удалить характеристику (${response.status})`)
  }
}
