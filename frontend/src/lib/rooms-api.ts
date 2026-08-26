import { apiFetch } from './api-base'
import { fetchListPage, fetchListFacets, type ListOptions, type ListPage, type FacetOption } from './list-api'
import { i18n } from '@/i18n'

export interface Room {
  id: number
  guid: string | null
  room: string
}

export type CharacteristicValueType = 'BOOLEAN' | 'NUMBER' | 'TEXT'
export type CharacteristicValue = boolean | number | string | null

export interface RoomCharacteristic {
  id: number
  definitionId: number
  name: string
  valueType: CharacteristicValueType
  unit: string | null
  value: CharacteristicValue
  period: string
  isProtected: boolean
}

export interface RoomHistoryEntry {
  id: number
  definitionId: number
  name: string
  valueType: CharacteristicValueType
  unit: string | null
  period: string
  value: CharacteristicValue
  isProtected: boolean
}

// characteristics — по одной (самой актуальной по period) записи на каждую встретившуюся
// характеристику, history — вся история значений этой комнаты, см. pickCurrentCharacteristics
// на бэкенде.
export interface RoomDetail extends Room {
  characteristics: RoomCharacteristic[]
  history: RoomHistoryEntry[]
}

export type RoomsPage = ListPage<Room>

export function fetchRooms(options: ListOptions): Promise<RoomsPage> {
  return fetchListPage<Room>('/rooms', options)
}

// Для дерева "Общежитие → этажи → комнаты" — все комнаты разом, без пагинации.
export interface RoomTreeItem {
  id: number
  room: string
  floor: number | null
}

export async function fetchRoomsTree(): Promise<RoomTreeItem[]> {
  const response = await apiFetch('/rooms/tree')
  if (!response.ok) {
    throw new Error(i18n.global.t('rooms.errors.fetchListFailed', { status: response.status }))
  }
  return response.json()
}

export function fetchFacetValues(field: string): Promise<FacetOption[]> {
  return fetchListFacets('/rooms', field)
}

export async function fetchRoomDetail(id: number): Promise<RoomDetail> {
  const response = await apiFetch(`/rooms/${id}`)
  if (!response.ok) {
    throw new Error(i18n.global.t('rooms.errors.fetchRoomFailed', { status: response.status }))
  }
  return response.json()
}

export async function createRoom(room: string, floor: number): Promise<Room> {
  const response = await apiFetch('/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room, floor }),
  })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? i18n.global.t('rooms.errors.createRoomFailed', { status: response.status }))
  }
  return response.json()
}

export async function updateRoom(id: number, room: string): Promise<Room> {
  const response = await apiFetch(`/rooms/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room }),
  })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? i18n.global.t('rooms.errors.updateRoomFailed', { status: response.status }))
  }
  return response.json()
}

export async function deleteRoom(id: number): Promise<void> {
  const response = await apiFetch(`/rooms/${id}`, { method: 'DELETE' })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? i18n.global.t('rooms.errors.deleteRoomFailed', { status: response.status }))
  }
}

export interface CharacteristicValueInput {
  definitionId: number
  period: string
  value: boolean | number | string
}

export async function addCharacteristicValue(roomId: number, input: CharacteristicValueInput): Promise<RoomHistoryEntry> {
  const response = await apiFetch(`/rooms/${roomId}/characteristics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? i18n.global.t('rooms.errors.addValueFailed', { status: response.status }))
  }
  return response.json()
}

export async function updateCharacteristicValue(
  roomId: number,
  valueId: number,
  input: { period?: string; value?: boolean | number | string },
): Promise<RoomHistoryEntry> {
  const response = await apiFetch(`/rooms/${roomId}/characteristics/${valueId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? i18n.global.t('rooms.errors.updateValueFailed', { status: response.status }))
  }
  return response.json()
}

export async function deleteCharacteristicValue(roomId: number, valueId: number): Promise<void> {
  const response = await apiFetch(`/rooms/${roomId}/characteristics/${valueId}`, { method: 'DELETE' })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? i18n.global.t('rooms.errors.deleteValueFailed', { status: response.status }))
  }
}
