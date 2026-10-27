import { ref } from 'vue'
import { getStoredLocale, i18n } from '@/i18n'

export function apiUrl(path: string): string {
  return `${window.location.protocol}//${window.location.hostname}:3000${path}`
}

export const sessionExpired = ref(false)

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  if (!headers.has('Accept-Language')) headers.set('Accept-Language', getStoredLocale())
  const response = await fetch(apiUrl(path), { ...init, headers, credentials: 'include' })
  if (response.status === 401 && path !== '/auth/me') {
    sessionExpired.value = true
  }
  if (response.status === 429) {
    return new Response(JSON.stringify({ message: i18n.global.t('errors.tooManyRequests') }), {
      status: response.status,
      statusText: response.statusText,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return response
}
