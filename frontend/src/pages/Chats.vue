<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { FileText, Home } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import ConversationList from '@/components/chat/ConversationList.vue'
import ChatThread from '@/components/chat/ChatThread.vue'
import BroadcastDialog from '@/components/chat/BroadcastDialog.vue'
import { useChatStream, type ChatStreamEvent } from '@/lib/chat-stream'
import { hasUnreadStaffChats } from '@/lib/chat-unread-state'
import {
  fetchConversationMessages,
  fetchConversations,
  fetchResidentInfo,
  markConversationRead,
  sendStaffMessage,
  type ChatConversationListItem,
  type ChatMessage,
  type ResidentInfo,
} from '@/lib/chat-api'

const conversations = ref<ChatConversationListItem[]>([])
const selectedId = ref<number | null>(null)
const messages = ref<ChatMessage[]>([])
const residentInfo = ref<ResidentInfo | null>(null)
const broadcastDialogRef = ref<InstanceType<typeof BroadcastDialog> | null>(null)

async function loadConversations() {
  conversations.value = await fetchConversations()
  hasUnreadStaffChats.value = conversations.value.some((c) => c.unread)
}

async function selectConversation(id: number) {
  selectedId.value = id
  residentInfo.value = null
  const [msgs, info] = await Promise.all([fetchConversationMessages(id), fetchResidentInfo(id)])
  messages.value = msgs
  residentInfo.value = info
  await markConversationRead(id)
  const conversation = conversations.value.find((c) => c.id === id)
  if (conversation) conversation.unread = false
  hasUnreadStaffChats.value = conversations.value.some((c) => c.unread)
}

async function onSend(body: string, files: File[]) {
  if (!selectedId.value) return
  await sendStaffMessage(selectedId.value, body, files)
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
    hasUnreadStaffChats.value = conversations.value.some((c) => c.unread)
  }
})

function openBroadcast() {
  broadcastDialogRef.value?.open()
}

onMounted(loadConversations)
</script>

<template>
  <div class="flex h-full min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <h1 class="shrink-0 text-lg font-medium">Чаты</h1>

    <Card class="flex min-h-0 flex-1 flex-row gap-0 overflow-hidden py-0">
      <ConversationList :conversations="conversations" :selected-id="selectedId" @select="selectConversation" @new-message="openBroadcast" />

      <div class="flex min-h-0 flex-1 flex-col">
        <!-- Та же "рецептура" высоты, что у строки поиска слева (ConversationList.vue —
             p-3 снаружи + h-10 содержимое), чтобы шапка выровнялась по высоте с ней
             пиксель в пиксель, а не подгонялась на глаз константой. -->
        <div v-if="selectedId" class="flex shrink-0 items-center gap-4 border-b p-3 text-sm text-muted-foreground">
          <span class="flex h-10 items-center gap-1.5">
            <FileText class="size-4 text-primary" />
            {{ residentInfo?.contractNumber ? `Договор № ${residentInfo.contractNumber}` : 'Нет действующего договора' }}
          </span>
          <span v-if="residentInfo?.room" class="flex h-10 items-center gap-1.5">
            <Home class="size-4 text-primary" />
            Комната {{ residentInfo.room }}
          </span>
        </div>

        <ChatThread
          v-if="selectedId"
          :key="selectedId"
          :messages="messages"
          viewer-role="STAFF"
          attachment-base-path="/chats/attachments"
          :on-send="onSend"
        />
        <p v-else class="m-auto text-sm text-muted-foreground">Выберите диалог слева</p>
      </div>
    </Card>

    <BroadcastDialog ref="broadcastDialogRef" @sent="loadConversations" />
  </div>
</template>
