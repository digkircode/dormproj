import type { ChatMessage } from './chat-api'

// Верхняя граница сообщений, которые держим в реактивном массиве разом — иначе очень
// длинная переписка (много лет, много вложений) со временем разрастётся в тяжёлый DOM/
// память при активной пагинации по скроллу вверх. 200 — с запасом даже для активной
// многомесячной переписки одного проживающего, не задевает типичный объём (see промпт
// проекта — общежитие на 617 мест, не групповой чат с тысячами сообщений).
export const MAX_LOADED_MESSAGES = 200

// Новые сообщения (из SSE-триггера — см. Chats.vue/MyChat.vue) добавляются В КОНЕЦ,
// дедуп по id (SSE может прилететь раньше или позже уже сделанного вручную refetch).
// Лишнее при переполнении обрезаем СПЕРЕДИ (старые) — пользователь смотрит на свежий
// хвост, откуда прилетело новое сообщение, не на историю.
//
// Уже загруженные сообщения, которые попали и в fetched (свежую страницу) — ОБНОВЛЯЕМ
// их полями из fetched, не просто пропускаем. SSE прилетает не только на новое
// сообщение, но и на "диалог прочитали" (см. POST :id/read / GET /my-chat на бэке) —
// без этого обновления галочки "прочитано"/read у уже отрисованных сообщений молча
// зависали бы старыми до следующего события с действительно новым id (реальный баг,
// пойманный на "прочтение в реальном времени не работает у проживающего").
export function appendNewMessages(current: ChatMessage[], fetched: ChatMessage[]): ChatMessage[] {
  const fetchedById = new Map(fetched.map((m) => [m.id, m]))
  const currentIds = new Set(current.map((m) => m.id))
  const updated = current.map((m) => fetchedById.get(m.id) ?? m)
  const newOnes = fetched.filter((m) => !currentIds.has(m.id))
  const merged = [...updated, ...newOnes]
  return merged.length > MAX_LOADED_MESSAGES ? merged.slice(merged.length - MAX_LOADED_MESSAGES) : merged
}

// История по скроллу вверх (see ChatThread.vue) добавляется В НАЧАЛО, дедуп по id.
// Лишнее при переполнении обрезаем СЗАДИ (свежие) — раз пользователь только что уехал
// скроллом наверх от них, отбросить хвост безопаснее, чем то, что он сейчас читает.
export function prependOlderMessages(current: ChatMessage[], fetched: ChatMessage[]): ChatMessage[] {
  const existingIds = new Set(current.map((m) => m.id))
  const olderOnes = fetched.filter((m) => !existingIds.has(m.id))
  if (olderOnes.length === 0) return current
  const merged = [...olderOnes, ...current]
  return merged.length > MAX_LOADED_MESSAGES ? merged.slice(0, MAX_LOADED_MESSAGES) : merged
}
