// Бэкенд всегда на порту 3000 того же хоста, что и фронт (см. docker-compose) —
// поэтому проще вычислить адрес во время выполнения, чем городить build-time env var.
export function apiUrl(path: string): string {
  return `${window.location.protocol}//${window.location.hostname}:3000${path}`
}

// credentials: 'include' обязателен для всех запросов к API — без него браузер
// не отправит сессионную куку авторизации на кросс-origin бэкенд (другой порт).
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(apiUrl(path), { ...init, credentials: 'include' })
  // Общий rate-limiting (ThrottlerModule, 100 req/min/IP, см. app.module.ts) отдаёт
  // дефолтный "ThrottlerException: Too Many Requests" — технично и по-английски.
  // Подменяем тело ответа здесь, в одной точке, а не в каждом api-файле по отдельности:
  // весь фронт уже читает {message} из JSON-тела через одинаковый паттерн
  // (`response.json().catch(() => ({})); body.message ?? fallback`, см. contracts-api.ts/
  // chat-api.ts и т.п.) — подмена подхватывается везде сама, без правок в каждом месте.
  if (response.status === 429) {
    return new Response(JSON.stringify({ message: 'Слишком много запросов — подождите немного и попробуйте ещё раз' }), {
      status: response.status,
      statusText: response.statusText,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return response
}
