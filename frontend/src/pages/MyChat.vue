<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import ChatThread from '@/components/chat/ChatThread.vue'
import { useChatStream, type ChatStreamEvent } from '@/lib/chat-stream'
import { hasUnreadResidentChat } from '@/lib/chat-unread-state'
import { appendNewMessages, prependOlderMessages } from '@/lib/chat-message-list'
import { fetchMyChat, sendMyMessage, type ChatMessage } from '@/lib/chat-api'
import { goBack } from '@/lib/utils'

const router = useRouter()

// Один диалог на аккаунт — "между проживающими чата нет" (см. промпт проекта), поэтому
// в отличие от Chats.vue здесь нет списка слева, только сама переписка.
const messages = ref<ChatMessage[]>([])
const hasMoreOlder = ref(false)
const isLoadingOlder = ref(false)
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
    hasMoreOlder.value = chat.hasMore
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

// Подгрузка истории по скроллу вверх — курсор от самого старого уже загруженного
// сообщения, не бампает residentLastReadAt (см. my-chat.controller.ts — только первая
// страница, before не задан).
async function loadOlderMessages() {
  if (!hasMoreOlder.value || isLoadingOlder.value) return
  const oldestId = messages.value[0]?.id
  if (!oldestId) return
  isLoadingOlder.value = true
  try {
    const chat = await fetchMyChat(oldestId)
    messages.value = prependOlderMessages(messages.value, chat.messages)
    hasMoreOlder.value = chat.hasMore
  } finally {
    isLoadingOlder.value = false
  }
}

// id только что отправленных нами сообщений, ещё не подтверждённых своим же эхом по SSE
// (см. useChatStream ниже) — /my-chat/stream шлёт резиденту эхо и его собственной
// отправки тоже (фильтр там только по individualUid, тот совпадает с самим собой).
// Раньше по этому эху SSE-обработчик параллельно с onSend() запускал ЕЩЁ ОДИН
// fetchMyChat того же диалога — гонка двух почти одновременных фетчей одного и того же
// (поймано на "дважды отправляется" на стороне сотрудника, тот же класс гонки и здесь).
const pendingSelfSentIds = new Set<number>()

async function onSend(body: string, files: File[]) {
  const sent = await sendMyMessage(body, files)
  pendingSelfSentIds.add(sent.id)
  const chat = await fetchMyChat()
  messages.value = appendNewMessages(messages.value, chat.messages)
}

// ЧУЖОЕ SSE-событие (сообщение от сотрудника, либо факт прочтения — см. промпт проекта) —
// только новые/обновлённые поля (не полный load(), тот заменил бы весь массив и стёр уже
// подгруженную по пагинации историю, см. appendNewMessages). fetchMyChat() без before
// бампает residentLastReadAt при каждом вызове — резидент уже смотрит на экран, это
// корректно и здесь.
useChatStream(
  '/my-chat/stream',
  async (event: ChatStreamEvent) => {
    if (event.messageId != null && pendingSelfSentIds.delete(event.messageId)) return
    const chat = await fetchMyChat()
    messages.value = appendNewMessages(messages.value, chat.messages)
    hasUnreadResidentChat.value = false
  },
  streamEnabled,
)

onMounted(load)
</script>

<template>
  <div class="flex h-full min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/')">
        <ArrowLeft class="text-primary" />
        <span class="sr-only">Назад</span>
      </Button>
      <h1 class="text-lg font-medium">Чат с сотрудниками</h1>
    </div>
    <Card class="flex min-h-0 flex-1 flex-col overflow-hidden py-0">
      <p v-if="isLoading" class="m-auto text-sm text-muted-foreground">Загрузка…</p>
      <p v-else-if="loadError" class="m-auto max-w-md text-center text-sm text-red-500">{{ loadError }}</p>
      <ChatThread
        v-else
        :messages="messages"
        :has-more-older="hasMoreOlder"
        :on-load-older="loadOlderMessages"
        viewer-role="RESIDENT"
        attachment-base-path="/my-chat/attachments"
        :on-send="onSend"
      />
    </Card>
  </div>
</template>
