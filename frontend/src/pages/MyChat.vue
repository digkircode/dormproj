<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ArrowLeft, Clock, DoorClosed, FileText } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import ChatThread from '@/components/chat/ChatThread.vue'
import ChatThreadSkeleton from '@/components/chat/ChatThreadSkeleton.vue'
import { useChatStream, type ChatStreamEvent } from '@/lib/chat-stream'
import { hasUnreadResidentChat, residentUnreadCount } from '@/lib/chat-unread-state'
import { appendNewMessages, prependOlderMessages } from '@/lib/chat-message-list'
import { fetchMyChat, fetchMyResidentInfo, sendMyMessage, type ChatMessage, type MyResidentInfo } from '@/lib/chat-api'
import { goBack } from '@/lib/utils'

const router = useRouter()
const { t } = useI18n()

const messages = ref<ChatMessage[]>([])
const hasMoreOlder = ref(false)
const isLoadingOlder = ref(false)
const isLoading = ref(true)
const loadError = ref('')
const residentInfo = ref<MyResidentInfo | null>(null)
const streamEnabled = ref(false)

async function load() {
  loadError.value = ''
  try {
    const [chat, info] = await Promise.all([fetchMyChat(), fetchMyResidentInfo()])
    messages.value = chat.messages
    hasMoreOlder.value = chat.hasMore
    residentInfo.value = info
    streamEnabled.value = true
    hasUnreadResidentChat.value = false
    residentUnreadCount.value = 0
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isLoading.value = false
  }
}

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

const pendingSelfSentIds = new Set<number>()

async function onSend(body: string, files: File[]) {
  const sent = await sendMyMessage(body, files)
  pendingSelfSentIds.add(sent.id)
  const chat = await fetchMyChat()
  messages.value = appendNewMessages(messages.value, chat.messages)
}

useChatStream(
  '/my-chat/stream',
  async (event: ChatStreamEvent) => {
    if (document.visibilityState !== 'visible') return
    if (event.messageId != null && pendingSelfSentIds.delete(event.messageId)) return
    const chat = await fetchMyChat()
    messages.value = appendNewMessages(messages.value, chat.messages)
    hasUnreadResidentChat.value = false
    residentUnreadCount.value = 0
  },
  streamEnabled,
)

function onVisible() {
  if (document.visibilityState === 'visible' && streamEnabled.value) void load()
}
onMounted(() => { void load(); document.addEventListener('visibilitychange', onVisible) })
onUnmounted(() => document.removeEventListener('visibilitychange', onVisible))
</script>

<template>
  <div class="flex h-[100dvh] min-w-0 shrink-0 flex-col gap-3 p-3 sm:p-4 md:h-full md:min-h-0 md:flex-1 md:shrink md:gap-4 md:p-6">
    <div class="flex shrink-0 items-center gap-2 md:hidden">
      <Button variant="outline" size="icon" class="size-10 shrink-0 rounded-full bg-card shadow-sm" @click="goBack(router, '/')">
        <ArrowLeft class="size-4 text-primary" />
        <span class="sr-only">{{ t('chat.back') }}</span>
      </Button>
      <span class="flex min-w-0 items-center gap-2 rounded-full border bg-card px-3 py-2 text-xs text-muted-foreground shadow-sm">
        <Clock class="size-4 shrink-0 text-primary" />
        <span class="whitespace-nowrap">{{ t('chat.resident.officeHoursShort') }}</span>
      </span>
    </div>
    <div class="hidden items-center gap-2 md:flex">
      <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/')">
        <ArrowLeft class="text-primary" />
        <span class="sr-only">{{ t('chat.back') }}</span>
      </Button>
      <h1 class="text-lg font-medium">{{ t('chat.resident.title') }}</h1>
    </div>
    <Card class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden py-0">
      <ChatThreadSkeleton v-if="isLoading" header />
      <p v-else-if="loadError" class="m-auto max-w-md text-center text-sm text-red-500">{{ loadError }}</p>
      <template v-else>
        <div class="hidden shrink-0 flex-wrap items-center gap-2 border-b p-3 text-sm text-muted-foreground md:flex md:gap-4">
          <RouterLink
            v-if="residentInfo?.contractNumber"
            to="/student/contract"
            class="-mx-1.5 -my-0.5 hidden h-10 items-center gap-1.5 rounded-md px-1.5 transition-colors hover:bg-accent hover:text-accent-foreground md:flex"
          >
            <FileText class="size-4 text-primary" />
            {{ t('contracts.detail.titleWithNumber', { number: residentInfo.contractNumber }) }}
          </RouterLink>
          <span v-else class="hidden h-10 items-center gap-1.5 md:flex">
            <FileText class="size-4 text-primary" />
            {{ t('chat.noActiveContract') }}
          </span>
          <span v-if="residentInfo?.room" class="hidden h-10 items-center gap-1.5 md:flex">
            <DoorClosed class="size-4 text-primary" />
            {{ t('roomInfo.dialogTitle', { room: residentInfo.room }) }}
          </span>
          <span class="flex h-10 items-center gap-1.5">
            <Clock class="size-4 text-primary" />
            {{ t('chat.resident.officeHours') }}
          </span>
        </div>
        <ChatThread
          :messages="messages"
          :has-more-older="hasMoreOlder"
          :on-load-older="loadOlderMessages"
          viewer-role="RESIDENT"
          attachment-base-path="/my-chat/attachments"
          :on-send="onSend"
        />
      </template>
    </Card>
  </div>
</template>
