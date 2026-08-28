import { ref } from 'vue'
import { getStoredLocale, i18n } from '@/i18n'

// Бэкенд всегда на порту 3000 того же хоста, что и фронт (см. docker-compose) —
// поэтому проще вычислить адрес во время выполнения, чем городить build-time env var.
export function apiUrl(path: string): string {
  return `${window.location.protocol}//${window.location.hostname}:3000${path}`
}

// Живёт здесь, не в auth-state.ts — тот сам зависит от auth-api.ts, который зависит от
// этого файла (apiFetch/apiUrl), так что обратный импорт создал бы цикл. App.vue читает
// этот флаг напрямую отсюда и рисует поверх всего экрана предложение перелогиниться (см.
// известную проблему в промпте проекта "Истечение сессии не приводит к релогину" —
// раньше был просто текст "(401)" без явного действия, исправлено 2026-08-28).
export const sessionExpired = ref(false)

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
  // 401 отдаёт только AuthGuard (backend/src/auth/auth.guard.ts) — и только когда сессии
  // нет/истекла (роли/права — отдельный RolesGuard, у него 403, не 401), так что любой 401
  // здесь однозначно значит "сессия умерла, нужен релогин", кроме самого /auth/me — там 401
  // штатный исход первого захода без сессии, ensureUserLoaded() в auth-state.ts уже
  // обрабатывает его молча (см. fetchCurrentUser), не как "истекла", а просто "не был залогинен".
  if (response.status === 401 && path !== '/auth/me') {
    sessionExpired.value = true
  }
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
