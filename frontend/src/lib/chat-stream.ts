import { onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import { apiUrl } from './api-base'

export interface ChatStreamEvent {
  conversationId: number
  individualUid: string
  messageId?: number
}

export function useChatStream(path: string, onEvent: (event: ChatStreamEvent) => void, enabled: Ref<boolean> = ref(true)): void {
  let source: EventSource | null = null

  function connect() {
    if (source) return
    source = new EventSource(apiUrl(path), { withCredentials: true })
    source.onmessage = (message) => {
      try {
        onEvent(JSON.parse(message.data))
      } catch {
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
