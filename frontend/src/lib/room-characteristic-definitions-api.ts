import { apiFetch } from './api-base'
import type { CharacteristicValueType } from './rooms-api'
import type { ListOptions, ListPage, FacetOption } from './list-api'

export interface RoomCharacteristicDefinition {
  id: number
  name: string
  valueType: CharacteristicValueType
  unit: string | null
  isProtected: boolean
}

const VALUE_TYPE_LABELS: Record<CharacteristicValueType, string> = {
  BOOLEAN: 'Да/Нет',
  NUMBER: 'Число',
  TEXT: 'Текст',
}

export async function fetchDefinitions(): Promise<RoomCharacteristicDefinition[]> {
  const response = await apiFetch('/room-characteristic-definitions')
  if (!response.ok) {
    throw new Error(`Не удалось получить список характеристик (${response.status})`)
  }
  return response.json()
}

// Бэкенд отдаёт весь (небольшой) каталог одним списком — EntityTable ждёт постраничный
// контракт, поэтому пагинация/поиск/сортировка/фильтр по типу считаются здесь же, на
// уже полученных данных, а не отдельным сетевым запросом на каждое взаимодействие.
export async function fetchDefinitionsPage(options: ListOptions): Promise<ListPage<RoomCharacteristicDefinition>> {
  const all = await fetchDefinitions()

  let filtered = all
  if (options.search.trim()) {
    const query = options.search.trim().toLowerCase()
    filtered = filtered.filter((d) => d.name.toLowerCase().includes(query) || (d.unit ?? '').toLowerCase().includes(query))
  }
  const valueTypeFilter = options.filters.valueType
  if (valueTypeFilter?.length) {
    filtered = filtered.filter((d) => valueTypeFilter.includes(d.valueType))
  }

  const dir = options.sortDir === 'desc' ? -1 : 1
  const sorted = [...filtered].sort((a, b) => {
    if (options.sortBy === 'name') return dir * a.name.localeCompare(b.name, 'ru')
    if (options.sortBy === 'valueType') return dir * a.valueType.localeCompare(b.valueType);
    return dir * (a.id - b.id)
  })

  const start = (options.page - 1) * options.pageSize
  return { data: sorted.slice(start, start + options.pageSize), total: filtered.length, page: options.page, pageSize: options.pageSize }
}

export async function fetchDefinitionFacets(field: string): Promise<FacetOption[]> {
  if (field !== 'valueType') return []
  return (Object.keys(VALUE_TYPE_LABELS) as CharacteristicValueType[]).map((value) => ({ value, label: VALUE_TYPE_LABELS[value] }))
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
