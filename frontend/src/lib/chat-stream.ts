import { onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import { apiUrl } from './api-base'

export interface ChatStreamEvent {
  conversationId: number
  individualUid: string
  // Нет у событий "диалог прочитан" (см. POST /chats/:id/read, GET /my-chat на бэке) —
  // те не несут новое сообщение, только смену read/unreadByMe у уже существующих.
  messageId?: number
}

// EventSource, не WebSocket — направление "сервер -> клиент" здесь единственное, что
// нужно пушить (отправка уже идёт обычным POST), backend отдаёт SSE через @Sse() на том
// же порту 3000 (см. промпт проекта/план чата). withCredentials — обязателен, иначе
// браузер не отправит сессионную куку на кросс-origin бэкенд (тот же принцип, что
// credentials:'include' у apiFetch, см. api-base.ts). Переподключение при обрыве —
// встроенное поведение EventSource, ничего дополнительно писать не нужно.
//
// enabled — необязательный реактивный флаг: пока false, соединение вообще не
// открывается. Нужен странице проживающего (MyChat.vue) — если аккаунт не привязан к
// физлицу, /my-chat/stream всегда отвечает 400 (не text/event-stream), а EventSource
// в таком случае сам, без остановки, ретраит запрос каждые несколько секунд — без этого
// флага такой аккаунт держал бы вечный поток бесполезных запросов к бэкенду.
export function useChatStream(path: string, onEvent: (event: ChatStreamEvent) => void, enabled: Ref<boolean> = ref(true)): void {
  let source: EventSource | null = null

  function connect() {
    if (source) return
    source = new EventSource(apiUrl(path), { withCredentials: true })
    source.onmessage = (message) => {
      try {
        onEvent(JSON.parse(message.data))
      } catch {
        // Битое событие — игнорируем, следующее придёт штатно.
      }
    }
  }

  function disconnect() {
    source?.close()
    source = null
  }

  onMounted(() => {
    if (enabled.value) connect()
  })

  watch(enabled, (value) => (value ? connect() : disconnect()))

  onUnmounted(disconnect)
}
