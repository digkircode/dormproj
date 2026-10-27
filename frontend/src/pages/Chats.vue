<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ArrowLeft, Clock, FileText, DoorClosed } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { goBack } from '@/lib/utils'
import ConversationList from '@/components/chat/ConversationList.vue'
import ChatThread from '@/components/chat/ChatThread.vue'
import BroadcastDialog from '@/components/chat/BroadcastDialog.vue'
import ChatThreadSkeleton from '@/components/chat/ChatThreadSkeleton.vue'
import { Skeleton } from '@/components/ui/skeleton'
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
const { t } = useI18n()
const conversations = ref<ChatConversationListItem[]>([])
const isLoadingConversations = ref(true)
const conversationsError = ref('')
const selectedId = ref<number | null>(null)
const messages = ref<ChatMessage[]>([])
const hasMoreOlder = ref(false)
const isLoadingOlder = ref(false)
const residentInfo = ref<ResidentInfo | null>(null)
const broadcastDialogRef = ref<InstanceType<typeof BroadcastDialog> | null>(null)
const messagesLoadedFor = ref<number | null>(null)
const conversationError = ref('')
let selectionVersion = 0
let conversationsVersion = 0
const pendingStreamRefresh = new Set<number>()

async function loadConversations() {
  const version = ++conversationsVersion
  try {
    const list = await fetchConversations()
    if (version !== conversationsVersion) return
    conversations.value = list
    conversationsError.value = ''
    hasUnreadStaffChats.value = list.some((c) => c.unread)
  } catch (error) {
    if (version === conversationsVersion) conversationsError.value = error instanceof Error ? error.message : String(error)
  } finally {
    if (version === conversationsVersion) isLoadingConversations.value = false
  }
}

async function selectConversation(id: number) {
  if (id === selectedId.value && !conversationError.value) return
  const version = ++selectionVersion
  selectedId.value = id
  messagesLoadedFor.value = null
  messages.value = []
  pendingStreamRefresh.clear()
  hasMoreOlder.value = false
  isLoadingOlder.value = false
  residentInfo.value = null
  conversationError.value = ''
  try {
    const [page, info] = await Promise.all([fetchConversationMessages(id), fetchResidentInfo(id)])
    if (version !== selectionVersion || selectedId.value !== id) return
    messages.value = page.messages
    hasMoreOlder.value = page.hasMore
    messagesLoadedFor.value = id
    residentInfo.value = info
    while (pendingStreamRefresh.delete(id)) {
      const latest = await fetchConversationMessages(id)
      if (version !== selectionVersion || selectedId.value !== id) return
      messages.value = appendNewMessages(messages.value, latest.messages)
    }
    await markConversationRead(id)
    if (version !== selectionVersion || selectedId.value !== id) return
    conversationsVersion++
    const conversation = conversations.value.find((c) => c.id === id)
    if (conversation) conversation.unread = false
    hasUnreadStaffChats.value = conversations.value.some((c) => c.unread)
  } catch (error) {
    if (version === selectionVersion && selectedId.value === id) {
      conversationError.value = error instanceof Error ? error.message : String(error)
    }
  }
}

async function loadOlderMessages() {
  if (!selectedId.value || !hasMoreOlder.value || isLoadingOlder.value) return
  const id = selectedId.value
  const version = selectionVersion
  const oldestId = messages.value[0]?.id
  if (!oldestId) return
  isLoadingOlder.value = true
  try {
    const page = await fetchConversationMessages(id, oldestId)
    if (version !== selectionVersion || selectedId.value !== id) return
    messages.value = prependOlderMessages(messages.value, page.messages)
    hasMoreOlder.value = page.hasMore
  } finally {
    if (version === selectionVersion) isLoadingOlder.value = false
  }
}

const pendingSelfSentIds = new Set<number>()

async function onSend(body: string, files: File[]) {
  if (!selectedId.value) return
  const id = selectedId.value
  const version = selectionVersion
  const sent = await sendStaffMessage(id, body, files)
  pendingSelfSentIds.add(sent.id)
  const page = await fetchConversationMessages(id)
  if (version === selectionVersion && selectedId.value === id) {
    messages.value = appendNewMessages(messages.value, page.messages)
  }
  await loadConversations()
}

useChatStream('/chats/stream', async (event: ChatStreamEvent) => {
  if (event.messageId != null && pendingSelfSentIds.delete(event.messageId)) return
  await loadConversations()
  if (event.conversationId === selectedId.value) {
    const id = selectedId.value
    if (messagesLoadedFor.value !== id) {
      pendingStreamRefresh.add(id)
      return
    }
    const version = selectionVersion
    const page = await fetchConversationMessages(id)
    if (version !== selectionVersion || selectedId.value !== id) return
    messages.value = appendNewMessages(messages.value, page.messages)
    await markConversationRead(id)
    if (version !== selectionVersion || selectedId.value !== id) return
    conversationsVersion++
    const conversation = conversations.value.find((c) => c.id === id)
    if (conversation) conversation.unread = false
    hasUnreadStaffChats.value = conversations.value.some((c) => c.unread)
  }
})

function openBroadcast() {
  broadcastDialogRef.value?.open()
}

function mobileBack() {
  if (selectedId.value === null) {
    goBack(router, '/')
    return
  }
  selectionVersion++
  selectedId.value = null
  messagesLoadedFor.value = null
  messages.value = []
  residentInfo.value = null
  conversationError.value = ''
}

onMounted(loadConversations)
</script>

<template>
  <div class="flex h-[100dvh] min-w-0 shrink-0 flex-col gap-3 p-3 sm:p-4 md:h-full md:min-h-0 md:flex-1 md:shrink md:gap-4 md:p-6">
    <div class="flex shrink-0 items-center gap-2 md:hidden">
      <Button variant="outline" size="icon" class="size-10 shrink-0 rounded-full bg-card shadow-sm" @click="mobileBack">
        <ArrowLeft class="size-4 text-primary" />
        <span class="sr-only">{{ t('chat.back') }}</span>
      </Button>
      <span class="flex min-w-0 items-center gap-2 rounded-full border bg-card px-3 py-2 text-xs text-muted-foreground shadow-sm">
        <Clock class="size-4 shrink-0 text-primary" />
        <span class="whitespace-nowrap">{{ t('chat.resident.officeHoursShort') }}</span>
      </span>
    </div>
    <div class="hidden shrink-0 items-center gap-2 md:flex">
      <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/')">
        <ArrowLeft class="text-primary" />
        <span class="sr-only">{{ t('chat.back') }}</span>
      </Button>
      <h1 class="text-lg font-medium">{{ t('chat.staff.title') }}</h1>
    </div>

    <Card class="flex min-h-0 min-w-0 flex-1 flex-row gap-0 overflow-hidden py-0">
      <ConversationList :conversations="conversations" :selected-id="selectedId" :is-loading="isLoadingConversations" :error="conversationsError" @select="selectConversation" @new-message="openBroadcast" />

      <div class="min-h-0 min-w-0 flex-1 flex-col" :class="selectedId ? 'flex' : 'hidden md:flex'">
        <div v-if="selectedId" class="flex shrink-0 items-center gap-4 border-b p-3 text-sm text-muted-foreground">
          <Skeleton v-if="messagesLoadedFor !== selectedId" class="h-10 w-64" />
          <RouterLink
            v-else-if="residentInfo?.contractId"
            :to="{ name: 'contract-detail', params: { id: residentInfo.contractId } }"
            class="-mx-1.5 flex h-10 items-center gap-1.5 rounded-md px-1.5 transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <FileText class="size-4 text-primary" />
            {{ t('contracts.detail.titleWithNumber', { number: residentInfo.contractNumber }) }}
          </RouterLink>
          <span v-else-if="messagesLoadedFor === selectedId" class="flex h-10 items-center gap-1.5">
            <FileText class="size-4 text-primary" />
            {{ t('chat.noActiveContract') }}
          </span>
          <span v-if="residentInfo?.room" class="flex h-10 items-center gap-1.5">
            <DoorClosed class="size-4 text-primary" />
            {{ t('roomInfo.dialogTitle', { room: residentInfo.room }) }}
          </span>
        </div>

        <p v-if="conversationError && messagesLoadedFor === selectedId" class="px-3 pt-2 text-sm text-destructive">{{ conversationError }}</p>
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
        <p v-else-if="conversationError" class="m-auto p-4 text-sm text-destructive">{{ conversationError }}</p>
        <ChatThreadSkeleton v-else-if="selectedId" />
        <p v-else class="m-auto text-sm text-muted-foreground">{{ t('chat.selectDialogHint') }}</p>
      </div>
    </Card>

    <BroadcastDialog ref="broadcastDialogRef" @sent="loadConversations" />
  </div>
</template>
