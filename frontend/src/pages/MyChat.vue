<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Card } from '@/components/ui/card'
import ChatThread from '@/components/chat/ChatThread.vue'
import { useChatStream } from '@/lib/chat-stream'
import { hasUnreadResidentChat } from '@/lib/chat-unread-state'
import { fetchMyChat, sendMyMessage, type ChatMessage } from '@/lib/chat-api'

// Один диалог на аккаунт — "между проживающими чата нет" (см. промпт проекта), поэтому
// в отличие от Chats.vue здесь нет списка слева, только сама переписка.
const messages = ref<ChatMessage[]>([])
const isLoading = ref(true)
const loadError = ref('')
// Пока не известно, что первая загрузка прошла успешно — SSE не открываем (см.
// useChatStream): аккаунт может быть не привязан к физлицу (например тестовый ADMIN,
// которому вручную выдали роль RESIDENT без Individual) — тогда /my-chat/stream
// вечно отвечал бы 400, и без этого флага страница держала бы бесконечный ретрай.
const streamEnabled = ref(false)

async function load() {
  loadError.value = ''
  try {
    const chat = await fetchMyChat()
    messages.value = chat.messages
    streamEnabled.value = true
    // Открытие страницы = прочтение (fetchMyChat() уже бампнул residentLastReadAt на
    // бэке) — сбрасываем бейджик в сайдбаре сразу, не дожидаясь следующего SSE-события.
    hasUnreadResidentChat.value = false
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isLoading.value = false
  }
}

async function onSend(body: string, files: File[]) {
  await sendMyMessage(body, files)
  const chat = await fetchMyChat()
  messages.value = chat.messages
}

// fetchMyChat() сам бампает residentLastReadAt на бэке при каждом вызове (GET /my-chat
// открывает "свой" диалог — эквивалент прочтения), отдельный markMyChatRead() тут не нужен.
useChatStream('/my-chat/stream', load, streamEnabled)

onMounted(load)
</script>

<template>
  <div class="flex h-full min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <h1 class="text-lg font-medium">Чат с сотрудниками</h1>
    <Card class="flex h-[34rem] max-h-[70vh] shrink-0 flex-col overflow-hidden py-0">
      <p v-if="isLoading" class="m-auto text-sm text-muted-foreground">Загрузка…</p>
      <p v-else-if="loadError" class="m-auto max-w-md text-center text-sm text-red-500">{{ loadError }}</p>
      <ChatThread v-else :messages="messages" viewer-role="RESIDENT" attachment-base-path="/my-chat/attachments" :on-send="onSend" />
    </Card>
  </div>
</template>
