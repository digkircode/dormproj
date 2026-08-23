<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Plus } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import ConversationList from '@/components/chat/ConversationList.vue'
import ChatThread from '@/components/chat/ChatThread.vue'
import BroadcastDialog from '@/components/chat/BroadcastDialog.vue'
import { useChatStream, type ChatStreamEvent } from '@/lib/chat-stream'
import {
  fetchConversationMessages,
  fetchConversations,
  markConversationRead,
  sendStaffMessage,
  type ChatConversationListItem,
  type ChatMessage,
} from '@/lib/chat-api'

const conversations = ref<ChatConversationListItem[]>([])
const selectedId = ref<number | null>(null)
const messages = ref<ChatMessage[]>([])
const broadcastDialogRef = ref<InstanceType<typeof BroadcastDialog> | null>(null)

async function loadConversations() {
  conversations.value = await fetchConversations()
}

async function selectConversation(id: number) {
  selectedId.value = id
  messages.value = await fetchConversationMessages(id)
  await markConversationRead(id)
  const conversation = conversations.value.find((c) => c.id === id)
  if (conversation) conversation.unread = false
}

async function onSend(body: string) {
  if (!selectedId.value) return
  await sendStaffMessage(selectedId.value, body)
  messages.value = await fetchConversationMessages(selectedId.value)
  await loadConversations()
}

// Любое событие из SSE-потока (см. промпт проекта — реалтайм без перезагрузки) рефетчит
// список диалогов целиком (порядок/непрочитанность) — при небольшом числе диалогов
// общежития проще и надёжнее, чем инкрементальный мердж состояния на клиенте. Если
// событие относится к открытому диалогу — дозагружает его сообщения и сразу помечает
// прочитанным (сотрудник уже смотрит на экран).
useChatStream('/chats/stream', async (event: ChatStreamEvent) => {
  await loadConversations()
  if (event.conversationId === selectedId.value) {
    messages.value = await fetchConversationMessages(selectedId.value)
    await markConversationRead(selectedId.value)
    const conversation = conversations.value.find((c) => c.id === selectedId.value)
    if (conversation) conversation.unread = false
  }
})

onMounted(loadConversations)
</script>

<template>
  <div class="flex h-full min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex shrink-0 items-center justify-between">
      <h1 class="text-lg font-medium">Чаты</h1>
      <Button @click="broadcastDialogRef?.open()">
        <Plus />
        Написать проживающим
      </Button>
    </div>

    <Card class="flex min-h-0 flex-1 flex-row gap-0 overflow-hidden py-0">
      <ConversationList :conversations="conversations" :selected-id="selectedId" @select="selectConversation" />
      <ChatThread
        v-if="selectedId"
        :key="selectedId"
        :messages="messages"
        viewer-role="STAFF"
        :on-send="onSend"
      />
      <p v-else class="m-auto text-sm text-muted-foreground">Выберите диалог слева</p>
    </Card>

    <BroadcastDialog ref="broadcastDialogRef" @sent="loadConversations" />
  </div>
</template>
