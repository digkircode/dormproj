import { apiFetch } from './api-base'

export type ChatSenderRole = 'RESIDENT' | 'STAFF'

export interface ChatConversationListItem {
  id: number
  individualUid: string
  fullName: string
  lastMessage: string | null
  lastMessageAt: string
  unread: boolean
}

export interface ChatMessage {
  id: number
  body: string
  senderRole: ChatSenderRole
  senderFullName: string
  createdAt: string
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
  floor?: string
  corpus?: string
  debtorsOnly?: boolean
  search?: string
}

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

export async function sendStaffMessage(conversationId: number, body: string): Promise<void> {
  const response = await apiFetch(`/chats/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  })
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'Не удалось отправить сообщение'))
}

export async function markConversationRead(conversationId: number): Promise<void> {
  const response = await apiFetch(`/chats/${conversationId}/read`, { method: 'POST' })
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'Не удалось отметить диалог прочитанным'))
}

export async function fetchRecipientFacets(): Promise<ChatRecipientFacets> {
  const response = await apiFetch('/chats/recipients/filters')
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'Не удалось получить фильтры получателей'))
  return response.json()
}

function filtersToQuery(filters: ChatRecipientFilters): string {
  const params = new URLSearchParams()
  if (filters.floor) params.set('floor', filters.floor)
  if (filters.corpus) params.set('corpus', filters.corpus)
  if (filters.debtorsOnly) params.set('debtorsOnly', 'true')
  if (filters.search) params.set('search', filters.search)
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
  conversationId: number
  messages: ChatMessage[]
}

export async function fetchMyChat(): Promise<MyChatResponse> {
  const response = await apiFetch('/my-chat')
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'Не удалось получить чат'))
  return response.json()
}

export async function sendMyMessage(body: string): Promise<void> {
  const response = await apiFetch('/my-chat/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  })
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'Не удалось отправить сообщение'))
}
