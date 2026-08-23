<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { SendHorizontal } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import type { ChatMessage, ChatSenderRole } from '@/lib/chat-api'

// Общий для обеих сторон компонент — какая сторона выравнивается вправо ("свои"
// сообщения), определяет viewerRole, а не жёстко STAFF/RESIDENT. Имя отправителя
// показывается всегда, над каждым сообщением, независимо от того, чьё оно (по прямому
// требованию ТЗ) — это позволяет в общем инбоксе сотрудников видеть, кто именно из
// команды ответил, а не только "Сотрудник".
// onSend — асинхронная функция, а не emit: emit() не дожидается промиса слушателя,
// поэтому isSending/очистка черновика не могли бы отражать реальный результат отправки
// (индикатор гас бы мгновенно, а текст стирался бы даже при ошибке сети).
const props = defineProps<{
  messages: ChatMessage[]
  viewerRole: ChatSenderRole
  onSend: (body: string) => Promise<void>
  disabled?: boolean
  placeholder?: string
}>()

const draft = ref('')
const isSending = ref(false)
const sendError = ref('')
const scrollEl = ref<HTMLDivElement | null>(null)

function scrollToBottom() {
  nextTick(() => {
    if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight
  })
}

watch(
  () => props.messages.length,
  () => scrollToBottom(),
)

function formatTime(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  if (isToday) {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}

async function send() {
  const body = draft.value.trim()
  if (!body || isSending.value) return
  sendError.value = ''
  isSending.value = true
  try {
    await props.onSend(body)
    draft.value = ''
  } catch (error) {
    sendError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isSending.value = false
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    send()
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div ref="scrollEl" class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
      <p v-if="messages.length === 0" class="m-auto text-sm text-muted-foreground">Сообщений пока нет</p>
      <div
        v-for="message in messages"
        :key="message.id"
        class="flex flex-col gap-1"
        :class="message.senderRole === viewerRole ? 'items-end' : 'items-start'"
      >
        <span class="px-1 text-xs font-medium text-muted-foreground">{{ message.senderFullName }}</span>
        <div
          class="max-w-[70%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap"
          :class="
            message.senderRole === viewerRole
              ? 'rounded-tr-sm bg-primary text-primary-foreground'
              : 'rounded-tl-sm bg-muted text-foreground'
          "
        >
          {{ message.body }}
        </div>
        <span class="px-1 text-xs text-muted-foreground">{{ formatTime(message.createdAt) }}</span>
      </div>
    </div>

    <p v-if="sendError" class="px-3 text-sm text-red-500">{{ sendError }}</p>
    <div class="flex items-end gap-2 border-t p-3">
      <textarea
        v-model="draft"
        :disabled="disabled"
        :placeholder="placeholder ?? 'Написать сообщение...'"
        rows="2"
        class="flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground transition-shadow focus-visible:outline-none focus-visible:border-ring/50 focus-visible:ring-4 focus-visible:ring-ring/20 focus-visible:shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
        @keydown="onKeydown"
      />
      <Button :disabled="disabled || !draft.trim()" :loading="isSending" size="icon" @click="send">
        <SendHorizontal class="size-4" />
      </Button>
    </div>
  </div>
</template>
