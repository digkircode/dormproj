import type { ChatMessage } from './chat-api'

export const MAX_LOADED_MESSAGES = 200

export function appendNewMessages(current: ChatMessage[], fetched: ChatMessage[]): ChatMessage[] {
  const fetchedById = new Map(fetched.map((m) => [m.id, m]))
  const currentIds = new Set(current.map((m) => m.id))
  const updated = current.map((m) => fetchedById.get(m.id) ?? m)
  const newOnes = fetched.filter((m) => !currentIds.has(m.id))
  const merged = [...updated, ...newOnes]
  return merged.length > MAX_LOADED_MESSAGES ? merged.slice(merged.length - MAX_LOADED_MESSAGES) : merged
}

export function prependOlderMessages(current: ChatMessage[], fetched: ChatMessage[]): ChatMessage[] {
  const existingIds = new Set(current.map((m) => m.id))
  const olderOnes = fetched.filter((m) => !existingIds.has(m.id))
  if (olderOnes.length === 0) return current
  const merged = [...olderOnes, ...current]
  return merged.length > MAX_LOADED_MESSAGES ? merged.slice(0, MAX_LOADED_MESSAGES) : merged
}
