import { getStoredLocale, i18n } from '@/i18n'

// Бэкенд всегда на порту 3000 того же хоста, что и фронт (см. docker-compose) —
// поэтому проще вычислить адрес во время выполнения, чем городить build-time env var.
export function apiUrl(path: string): string {
  return `${window.location.protocol}//${window.location.hostname}:3000${path}`
}

// credentials: 'include' обязателен для всех запросов к API — без него браузер
// не отправит сессионную куку авторизации на кросс-origin бэкенд (другой порт).
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  // Accept-Language — safelisted CORS-заголовок, не требует правок enableCors() на бэке.
  // Бэкенд резолвит его через nestjs-i18n (HeaderResolver, см. app.module.ts) и переводит
  // ошибки валидации/API на этот язык — читаем localStorage напрямую, а не через useI18n(),
  // т.к. apiFetch дёргается и вне компонентов.
  const headers = new Headers(init.headers)
  if (!headers.has('Accept-Language')) headers.set('Accept-Language', getStoredLocale())
  const response = await fetch(apiUrl(path), { ...init, headers, credentials: 'include' })
  // Общий rate-limiting (ThrottlerModule, 100 req/min/IP, см. app.module.ts) отдаёт
  // дефолтный "ThrottlerException: Too Many Requests" — технично и по-английски.
  // Подменяем тело ответа здесь, в одной точке, а не в каждом api-файле по отдельности:
  // весь фронт уже читает {message} из JSON-тела через одинаковый паттерн
  // (`response.json().catch(() => ({})); body.message ?? fallback`, см. contracts-api.ts/
  // chat-api.ts и т.п.) — подмена подхватывается везде сама, без правок в каждом месте.
  if (response.status === 429) {
    return new Response(JSON.stringify({ message: i18n.global.t('errors.tooManyRequests') }), {
      status: response.status,
      statusText: response.statusText,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return response
}
