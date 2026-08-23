<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Card } from '@/components/ui/card'
import ChatThread from '@/components/chat/ChatThread.vue'
import { useChatStream } from '@/lib/chat-stream'
import { fetchMyChat, sendMyMessage, type ChatMessage } from '@/lib/chat-api'

// Один диалог на аккаунт — "между проживающими чата нет" (см. промпт проекта), поэтому
// в отличие от Chats.vue здесь нет списка слева, только сама переписка.
const messages = ref<ChatMessage[]>([])
const isLoaded = ref(false)

async function load() {
  const chat = await fetchMyChat()
  messages.value = chat.messages
  isLoaded.value = true
}

async function onSend(body: string) {
  await sendMyMessage(body)
  const chat = await fetchMyChat()
  messages.value = chat.messages
}

// fetchMyChat() сам бампает residentLastReadAt на бэке при каждом вызове (GET /my-chat
// открывает "свой" диалог — эквивалент прочтения), отдельный markMyChatRead() тут не нужен.
useChatStream('/my-chat/stream', load)

onMounted(load)
</script>

<template>
  <div class="flex h-full min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <h1 class="text-lg font-medium">Чат с сотрудниками</h1>
    <Card class="flex min-h-0 flex-1 flex-col overflow-hidden py-0">
      <ChatThread v-if="isLoaded" :messages="messages" viewer-role="RESIDENT" :on-send="onSend" />
    </Card>
  </div>
</template>
