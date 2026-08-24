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
  // Непрочитано ЛИЧНО текущим зрителем (в отличие от read выше — тот про "прочитано той
  // стороной", для галочек) — снимок на момент открытия диалога/чата, не пересчитывается
  // при подгрузке истории или по ходу сессии. Только на этом флаге строится разделитель
  // "новые сообщения" и автоскролл к первому непрочитанному, см. ChatThread.vue.
  unreadByMe: boolean
}

export interface ChatMessagesPage {
  messages: ChatMessage[]
  hasMore: boolean
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

export async function fetchConversationMessages(conversationId: number, before?: number): Promise<ChatMessagesPage> {
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

// Возвращает id только что созданного сообщения — Chats.vue отмечает его "своим",
// чтобы не обрабатывать эхо этого же сообщения ещё раз, когда оно придёт по SSE
// (см. useChatStream в Chats.vue — гонка двух параллельных фетчей одного диалога была
// поймана на "дважды отправляется").
export async function sendStaffMessage(conversationId: number, body: string, files: File[] = []): Promise<{ id: number; createdAt: string }> {
  const response = await apiFetch(`/chats/${conversationId}/messages`, {
    method: 'POST',
    body: messageFormData(body, files),
  })
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'Не удалось отправить сообщение'))
  return response.json()
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

// multipart/form-data, а не JSON (2026-08-24, добавлены вложения) — фильтры уходят одним
// текстовым полем 'filters' (JSON-строка), файлы — тем же 'files', что и у обычной
// отправки (см. messageFormData/chats.controller.ts#broadcast).
export async function sendBroadcast(body: string, filters: ChatRecipientFilters, files: File[] = []): Promise<{ sentCount: number }> {
  const form = new FormData()
  form.set('body', body)
  form.set('filters', JSON.stringify(filters))
  for (const file of files) form.append('files', file)
  const response = await apiFetch('/chats/broadcast', { method: 'POST', body: form })
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'Не удалось отправить рассылку'))
  return response.json()
}

// ===== Личный чат проживающего =====

export interface MyChatResponse {
  // null — диалога ещё нет (никто ничего не писал, см. my-chat.controller.ts —
  // GET / больше не заводит диалог сам по себе за факт открытия вкладки).
  conversationId: number | null
  messages: ChatMessage[]
  hasMore: boolean
}

// before — подгрузка истории по скроллу вверх (см. ChatThread.vue); бампает
// residentLastReadAt (открытие = прочтение) только на первой странице, см.
// my-chat.controller.ts.
export async function fetchMyChat(before?: number): Promise<MyChatResponse> {
  const query = before ? `?before=${before}` : ''
  const response = await apiFetch(`/my-chat${query}`)
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

// Без contractId (в отличие от ResidentInfo выше) — /contracts/:id доступен только
// STAFF/ADMIN. Клик по номеру договора в MyChat.vue ведёт на /student/contract
// (contracts-api.ts#fetchMyContract), тот сам резолвит "чей это договор" на бэке по
// сессии, id ему не нужен вообще.
export interface MyResidentInfo {
  contractNumber: string | null
  room: string | null
}

export async function fetchMyResidentInfo(): Promise<MyResidentInfo> {
  const response = await apiFetch('/my-chat/resident-info')
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'Не удалось получить информацию о договоре'))
  return response.json()
}

// Возвращает id только что созданного сообщения — та же причина, что у sendStaffMessage
// выше (дедуп собственного эха по SSE в MyChat.vue).
export async function sendMyMessage(body: string, files: File[] = []): Promise<{ id: number; createdAt: string }> {
  const response = await apiFetch('/my-chat/messages', {
    method: 'POST',
    body: messageFormData(body, files),
  })
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'Не удалось отправить сообщение'))
  return response.json()
}
