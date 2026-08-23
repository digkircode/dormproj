import { onMounted, onUnmounted } from 'vue'
import { apiUrl } from './api-base'

export interface ChatStreamEvent {
  conversationId: number
  individualUid: string
  messageId: number
}

// EventSource, не WebSocket — направление "сервер -> клиент" здесь единственное, что
// нужно пушить (отправка уже идёт обычным POST), backend отдаёт SSE через @Sse() на том
// же порту 3000 (см. промпт проекта/план чата). withCredentials — обязателен, иначе
// браузер не отправит сессионную куку на кросс-origin бэкенд (тот же принцип, что
// credentials:'include' у apiFetch, см. api-base.ts). Переподключение при обрыве —
// встроенное поведение EventSource, ничего дополнительно писать не нужно.
export function useChatStream(path: string, onEvent: (event: ChatStreamEvent) => void): void {
  let source: EventSource | null = null

  onMounted(() => {
    source = new EventSource(apiUrl(path), { withCredentials: true })
    source.onmessage = (message) => {
      try {
        onEvent(JSON.parse(message.data))
      } catch {
        // Битое событие — игнорируем, следующее придёт штатно.
      }
    }
  })

  onUnmounted(() => {
    source?.close()
    source = null
  })
}
