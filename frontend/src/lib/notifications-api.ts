import { apiFetch } from './api-base'

export type NotificationChannel = 'TELEGRAM' | 'MAX'
export interface NotificationChannelStatus {
  channel: NotificationChannel
  available: boolean
  connected: boolean
}

export async function fetchNotificationChannels(): Promise<NotificationChannelStatus[]> {
  const response = await apiFetch('/my-notifications')
  if (!response.ok) throw new Error('status')
  return response.json()
}

export async function createNotificationLink(channel: NotificationChannel): Promise<string> {
  const response = await apiFetch(`/my-notifications/${channel}/link`, { method: 'POST' })
  if (!response.ok) throw new Error('link')
  const body: { url: string } = await response.json()
  return body.url
}

export async function disconnectNotificationChannel(channel: NotificationChannel): Promise<void> {
  const response = await apiFetch(`/my-notifications/${channel}`, { method: 'DELETE' })
  if (!response.ok) throw new Error('disconnect')
}

export async function syncNotificationLocale(locale: 'ru' | 'en'): Promise<void> {
  await apiFetch('/my-notifications/locale', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locale }),
  })
}
