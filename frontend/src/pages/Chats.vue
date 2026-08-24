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
import { appendNewMessages, prependOlderMessages } from '@/lib/chat-message-list'
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
const hasMoreOlder = ref(false)
const isLoadingOlder = ref(false)
const residentInfo = ref<ResidentInfo | null>(null)
const broadcastDialogRef = ref<InstanceType<typeof BroadcastDialog> | null>(null)
// ChatThread.vue снимает "первое непрочитанное" один раз при монтировании из своего
// messages-пропа — если смонтировать его СРАЗУ по клику (пока messages ещё не
// подгрузились с сервера), он захватит пустой/чужой (от предыдущего диалога) список.
// Это отдельный флаг, а не просто messages.value.length>0 — у диалога может не быть
// сообщений вовсе, тогда length всегда 0, но "загрузка для этого id завершилась" всё
// равно наступает.
const messagesLoadedFor = ref<number | null>(null)

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
  const [page, info] = await Promise.all([fetchConversationMessages(id), fetchResidentInfo(id)])
  messages.value = page.messages
  hasMoreOlder.value = page.hasMore
  messagesLoadedFor.value = id
  residentInfo.value = info
  await markConversationRead(id)
  const conversation = conversations.value.find((c) => c.id === id)
  if (conversation) conversation.unread = false
  hasUnreadStaffChats.value = conversations.value.some((c) => c.unread)
}

// Подгрузка истории по скроллу вверх (см. ChatThread.vue) — курсор от самого старого уже
// загруженного сообщения. Не трогает hasMoreOlder/messages, если запрос уже идёт (защита
// от повторного триггера тем же скролл-событием, пока первый ответ ещё не пришёл).
async function loadOlderMessages() {
  if (!selectedId.value || !hasMoreOlder.value || isLoadingOlder.value) return
  const oldestId = messages.value[0]?.id
  if (!oldestId) return
  isLoadingOlder.value = true
  try {
    const page = await fetchConversationMessages(selectedId.value, oldestId)
    messages.value = prependOlderMessages(messages.value, page.messages)
    hasMoreOlder.value = page.hasMore
  } finally {
    isLoadingOlder.value = false
  }
}

// id только что отправленных нами сообщений, ещё не подтверждённых своим же эхом по SSE
// (см. useChatStream ниже) — тот же поток /chats/stream шлёт сотруднику АБСОЛЮТНО все
// события, включая эхо его собственной отправки. Раньше по этому эху SSE-обработчик
// параллельно с onSend() запускал ЕЩЁ ОДИН fetchConversationMessages того же диалога —
// гонка двух почти одновременных фетчей одного и того же (поймано на "дважды
// отправляется"). Теперь onSend() помечает "это моё", SSE-обработчик такое эхо просто
// пропускает — apendNewMessages/loadConversations уже отработали в onSend().
const pendingSelfSentIds = new Set<number>()

async function onSend(body: string, files: File[]) {
  if (!selectedId.value) return
  const sent = await sendStaffMessage(selectedId.value, body, files)
  pendingSelfSentIds.add(sent.id)
  const page = await fetchConversationMessages(selectedId.value)
  messages.value = appendNewMessages(messages.value, page.messages)
  await loadConversations()
}

// Любое ЧУЖОЕ событие из SSE-потока (см. промпт проекта — реалтайм без перезагрузки)
// рефетчит список диалогов целиком (порядок/непрочитанность) — при небольшом числе
// диалогов общежития проще и надёжнее, чем инкрементальный мердж состояния на клиенте.
// Если событие относится к открытому диалогу — дозагружает только НОВЫЕ сообщения (не
// всю историю заново, см. appendNewMessages — раньше полный рефетч затирал бы уже
// подгруженные по пагинации старые страницы) и сразу помечает прочитанным (сотрудник уже
// смотрит на экран).
useChatStream('/chats/stream', async (event: ChatStreamEvent) => {
  if (event.messageId != null && pendingSelfSentIds.delete(event.messageId)) return
  await loadConversations()
  if (event.conversationId === selectedId.value) {
    const page = await fetchConversationMessages(selectedId.value)
    messages.value = appendNewMessages(messages.value, page.messages)
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

    <Card class="flex min-h-0 flex-1 flex-row gap-0 overflow-hidden py-0">
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
          v-if="selectedId && messagesLoadedFor === selectedId"
          :key="selectedId"
          :messages="messages"
          :has-more-older="hasMoreOlder"
          :on-load-older="loadOlderMessages"
          viewer-role="STAFF"
          attachment-base-path="/chats/attachments"
          :on-send="onSend"
        />
        <p v-else class="m-auto text-sm text-muted-foreground">{{ selectedId ? 'Загрузка…' : 'Выберите диалог слева' }}</p>
      </div>
    </Card>

    <BroadcastDialog ref="broadcastDialogRef" @sent="loadConversations" />
  </div>
</template>
