<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, FileText, DoorClosed } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { goBack } from '@/lib/utils'
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

const router = useRouter()
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
  // Клик по уже открытому диалогу — не гонять сеть заново (перезагрузка сообщений/
  // resident-info/повторная пометка прочитанным без надобности, см. известный баг проекта).
  if (id === selectedId.value) return
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
    <div class="flex shrink-0 items-center gap-2">
      <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/')">
        <ArrowLeft class="text-primary" />
        <span class="sr-only">Назад</span>
      </Button>
      <h1 class="text-lg font-medium">Чаты с проживающими</h1>
    </div>

    <!-- Ширина — не фиксированный max-w (тот оказался слишком узким и не рос с экраном),
         а доля от доступной ширины: убирает ~10% с каждой стороны, но масштабируется вместе
         со страницей. Высота — flex-1, во весь доступный экран. -->
    <Card class="mx-auto flex min-h-0 w-4/5 flex-1 flex-row gap-0 overflow-hidden py-0">
      <ConversationList :conversations="conversations" :selected-id="selectedId" @select="selectConversation" @new-message="openBroadcast" />

      <div class="flex min-h-0 flex-1 flex-col">
        <!-- Та же "рецептура" высоты, что у строки поиска слева (ConversationList.vue —
             p-3 снаружи + h-10 содержимое), чтобы шапка выровнялась по высоте с ней
             пиксель в пиксель, а не подгонялась на глаз константой. -->
        <div v-if="selectedId" class="flex shrink-0 items-center gap-4 border-b p-3 text-sm text-muted-foreground">
          <RouterLink
            v-if="residentInfo?.contractId"
            :to="{ name: 'contract-detail', params: { id: residentInfo.contractId } }"
            class="-mx-1.5 flex h-10 items-center gap-1.5 rounded-md px-1.5 transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <FileText class="size-4 text-primary" />
            Договор № {{ residentInfo.contractNumber }}
          </RouterLink>
          <span v-else class="flex h-10 items-center gap-1.5">
            <FileText class="size-4 text-primary" />
            Нет действующего договора
          </span>
          <span v-if="residentInfo?.room" class="flex h-10 items-center gap-1.5">
            <DoorClosed class="size-4 text-primary" />
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
