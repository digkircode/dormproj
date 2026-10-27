import { apiFetch, apiUrl } from './api-base'
import { i18n } from '@/i18n'

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
  body: string | null
  senderRole: ChatSenderRole
  senderFullName: string
  createdAt: string
  attachments: ChatAttachment[]
  read: boolean
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
  balance: number | null
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
  individualUids?: string[]
}

export function chatAttachmentUrl(basePath: string, attachmentId: number): string {
  return apiUrl(`${basePath}/${attachmentId}`)
}

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024
export const MAX_ATTACHMENTS_PER_MESSAGE = 5
export const ALLOWED_ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime']

async function parseErrorMessage(response: Response, fallbackKey: string): Promise<string> {
  const body: { message?: string } = await response.json().catch(() => ({}))
  return body.message ?? i18n.global.t(fallbackKey, { status: response.status })
}


export async function fetchConversations(): Promise<ChatConversationListItem[]> {
  const response = await apiFetch('/chats')
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'chat.errors.fetchConversationsFailed'))
  return response.json()
}

export async function fetchConversationMessages(conversationId: number, before?: number): Promise<ChatMessagesPage> {
  const query = before ? `?before=${before}` : ''
  const response = await apiFetch(`/chats/${conversationId}/messages${query}`)
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'chat.errors.fetchMessagesFailed'))
  return response.json()
}

function messageFormData(body: string, files: File[]): FormData {
  const form = new FormData()
  if (body) form.set('body', body)
  for (const file of files) form.append('files', file)
  return form
}

export async function sendStaffMessage(conversationId: number, body: string, files: File[] = []): Promise<{ id: number; createdAt: string }> {
  const response = await apiFetch(`/chats/${conversationId}/messages`, {
    method: 'POST',
    body: messageFormData(body, files),
  })
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'chat.errors.sendFailed'))
  return response.json()
}

export async function markConversationRead(conversationId: number): Promise<void> {
  const response = await apiFetch(`/chats/${conversationId}/read`, { method: 'POST' })
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'chat.errors.markReadFailed'))
}

export async function fetchResidentInfo(conversationId: number): Promise<ResidentInfo> {
  const response = await apiFetch(`/chats/${conversationId}/resident-info`)
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'chat.errors.fetchResidentInfoFailed'))
  return response.json()
}

export async function fetchRecipientFacets(): Promise<ChatRecipientFacets> {
  const response = await apiFetch('/chats/recipients/filters')
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'chat.errors.fetchRecipientFacetsFailed'))
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
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'chat.errors.fetchRecipientsFailed'))
  return response.json()
}

export interface ChatBroadcastStatus {
  id: number
  createdAt: string
  total: number
  pending: number
  sent: number
  failed: number
  status: 'RUNNING' | 'PARTIAL' | 'COMPLETED'
}

export async function sendBroadcast(body: string, filters: ChatRecipientFilters, requestId: string, files: File[] = []): Promise<ChatBroadcastStatus> {
  const form = new FormData()
  form.set('body', body)
  form.set('filters', JSON.stringify(filters))
  form.set('requestId', requestId)
  for (const file of files) form.append('files', file)
  const response = await apiFetch('/chats/broadcast', { method: 'POST', body: form })
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'chat.errors.sendBroadcastFailed'))
  return response.json()
}

export async function fetchBroadcastStatus(id: number): Promise<ChatBroadcastStatus> {
  const response = await apiFetch(`/chats/broadcasts/${id}`)
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'chat.errors.fetchBroadcastFailed'))
  return response.json()
}

export async function retryBroadcast(id: number): Promise<ChatBroadcastStatus> {
  const response = await apiFetch(`/chats/broadcasts/${id}/retry`, { method: 'POST' })
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'chat.errors.retryBroadcastFailed'))
  return response.json()
}


export interface MyChatResponse {
  conversationId: number | null
  messages: ChatMessage[]
  hasMore: boolean
}

export async function fetchMyChat(before?: number): Promise<MyChatResponse> {
  const query = before ? `?before=${before}` : ''
  const response = await apiFetch(`/my-chat${query}`)
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'chat.errors.fetchMyChatFailed'))
  return response.json()
}

export async function fetchMyChatUnread(): Promise<{ unread: boolean; count: number }> {
  const response = await apiFetch('/my-chat/unread')
  if (!response.ok) return { unread: false, count: 0 }
  return response.json()
}

export interface MyResidentInfo {
  contractNumber: string | null
  room: string | null
}

export async function fetchMyResidentInfo(): Promise<MyResidentInfo> {
  const response = await apiFetch('/my-chat/resident-info')
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'chat.errors.fetchMyResidentInfoFailed'))
  return response.json()
}

export async function sendMyMessage(body: string, files: File[] = []): Promise<{ id: number; createdAt: string }> {
  const response = await apiFetch('/my-chat/messages', {
    method: 'POST',
    body: messageFormData(body, files),
  })
  if (!response.ok) throw new Error(await parseErrorMessage(response, 'chat.errors.sendFailed'))
  return response.json()
}
