import { apiFetch, apiUrl } from './api-base'

export type ChatSenderRole = 'RESIDENT' | 'STAFF'

export interface ChatConversationListItem {
  id: number
  individualUid: string
  fullName: string
  lastMessage: string | null
  lastMessageAt: string
  unread: boolean
}

export type ChatAttachmentKind = 'IMAGE' | 'VIDEO'

export interface ChatAttachment {
  id: number
  kind: ChatAttachmentKind
  mimeType: string
  fileName: string
  sizeBytes: number
}

export interface ChatMessage {
  id: number
  // Nullable — сообщение может быть только вложением без текста (как в Telegram).
  body: string | null
  senderRole: ChatSenderRole
  senderFullName: string
  createdAt: string
  attachments: ChatAttachment[]
  // Прочитано ли "той стороной" (см. isMessageRead на бэке) — тиками показывается
  // только на своих сообщениях (см. ChatThread.vue): 1 серая — только отправляется
  // (клиент ещё не получил ответ сервера), 1 закрашенная — есть на сервере, 2
  // закрашенные — read=true.
  read: boolean
}

export interface ResidentInfo {
  contractId: number | null
  contractNumber: string | null
  room: string | null
}

export interface ChatRecipient {
  individualUid: string
  fullName: string
  room: string | null
  floor: string | null
  corpus: string | null
  balance: number
}

export interface ChatRecipientFacets {
  floors: string[]
  corpuses: string[]
  corpusAvailable: boolean
  totalCount: number
  debtorsCount: number
}

export interface ChatRecipientFilters {
  floors?: string[]
  corpus?: string
  debtorsOnly?: boolean
  search?: string
  // Явный выбор получателей по ФИО-поиску ("написать 3 конкретным людям") — если задан,
  // остальные фильтры выше игнорируются на бэке, см. chat-recipients.ts.
  individualUids?: string[]
}

// Разные пути на стороне сотрудников (/chats/attachments) и проживающего
// (/my-chat/attachments) — доступ проверяется по-разному (см. chats.controller.ts /
// my-chat.controller.ts), url строит вызывающий компонент (см. ChatThread.vue).
export function chatAttachmentUrl(basePath: string, attachmentId: number): string {
  return apiUrl(`${basePath}/${attachmentId}`)
}

// Лимиты — те же, что и на бэке (см. chat-attachments-storage.ts), продублированы тут
// для мгновенной подсказки в UI до отправки, а не только после ответа сервера с ошибкой.
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024
export const MAX_ATTACHMENTS_PER_MESSAGE = 5
export const ALLOWED_ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime']

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  const body: { message?: string } = await response.json().catch(() => ({}))
  return body.message ?? `${fallback} (${response.status})`
}

// ===== Инбокс сотрудников (STAFF/ADMIN) =====

export async function fetchConversations(): Promise<ChatConversationListItem[]> {
  const response = await apiFetch('/chats')
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'Не удалось получить список диалогов'))
  return response.json()
}

export async function fetchConversationMessages(conversationId: number, before?: number): Promise<ChatMessage[]> {
  const query = before ? `?before=${before}` : ''
  const response = await apiFetch(`/chats/${conversationId}/messages${query}`)
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'Не удалось получить сообщения'))
  return response.json()
}

// multipart/form-data, не JSON — сообщение может нести файлы (см. ChatAttachment выше).
// Content-Type НЕ выставляем вручную — браузер сам проставляет multipart-boundary при
// теле FormData, ручной заголовок его затирает и ломает разбор на бэке.
function messageFormData(body: string, files: File[]): FormData {
  const form = new FormData()
  if (body) form.set('body', body)
  for (const file of files) form.append('files', file)
  return form
}

export async function sendStaffMessage(conversationId: number, body: string, files: File[] = []): Promise<void> {
  const response = await apiFetch(`/chats/${conversationId}/messages`, {
    method: 'POST',
    body: messageFormData(body, files),
  })
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'Не удалось отправить сообщение'))
}

export async function markConversationRead(conversationId: number): Promise<void> {
  const response = await apiFetch(`/chats/${conversationId}/read`, { method: 'POST' })
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'Не удалось отметить диалог прочитанным'))
}

// Комната/действующий договор проживающего — шапка диалога у сотрудника.
export async function fetchResidentInfo(conversationId: number): Promise<ResidentInfo> {
  const response = await apiFetch(`/chats/${conversationId}/resident-info`)
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'Не удалось получить информацию о проживающем'))
  return response.json()
}

export async function fetchRecipientFacets(): Promise<ChatRecipientFacets> {
  const response = await apiFetch('/chats/recipients/filters')
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'Не удалось получить фильтры получателей'))
  return response.json()
}

function filtersToQuery(filters: ChatRecipientFilters): string {
  const params = new URLSearchParams()
  if (filters.floors?.length) params.set('floors', filters.floors.join(','))
  if (filters.corpus) params.set('corpus', filters.corpus)
  if (filters.debtorsOnly) params.set('debtorsOnly', 'true')
  if (filters.search) params.set('search', filters.search)
  if (filters.individualUids?.length) params.set('individualUids', filters.individualUids.join(','))
  const query = params.toString()
  return query ? `?${query}` : ''
}

export async function fetchRecipients(filters: ChatRecipientFilters): Promise<ChatRecipient[]> {
  const response = await apiFetch(`/chats/recipients${filtersToQuery(filters)}`)
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'Не удалось получить список получателей'))
  return response.json()
}

export async function sendBroadcast(body: string, filters: ChatRecipientFilters): Promise<{ sentCount: number }> {
  const response = await apiFetch('/chats/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body, ...filters }),
  })
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'Не удалось отправить рассылку'))
  return response.json()
}

// ===== Личный чат проживающего =====

export interface MyChatResponse {
  // null — диалога ещё нет (никто ничего не писал, см. my-chat.controller.ts —
  // GET / больше не заводит диалог сам по себе за факт открытия вкладки).
  conversationId: number | null
  messages: ChatMessage[]
}

export async function fetchMyChat(): Promise<MyChatResponse> {
  const response = await apiFetch('/my-chat')
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'Не удалось получить чат'))
  return response.json()
}

// Лёгкая проверка непрочитанного без побочного эффекта пометки прочтения (в отличие от
// fetchMyChat выше) — для бейджика в сайдбаре, см. lib/chat-unread-state.ts.
export async function fetchMyChatUnread(): Promise<boolean> {
  const response = await apiFetch('/my-chat/unread')
  if (!response.ok) return false
  const data: { unread: boolean } = await response.json()
  return data.unread
}

export async function sendMyMessage(body: string, files: File[] = []): Promise<void> {
  const response = await apiFetch('/my-chat/messages', {
    method: 'POST',
    body: messageFormData(body, files),
  })
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'Не удалось отправить сообщение'))
}
