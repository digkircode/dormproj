<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ArrowDown, Check, CheckCheck, FileVideo, Paperclip, SendHorizontal, X } from 'lucide-vue-next'
import { Skeleton } from '@/components/ui/skeleton'
import { avatarColorClasses, initials, shortName } from '@/lib/avatar-color'
import { currentUser } from '@/lib/auth-state'
import {
  chatAttachmentUrl,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  type ChatAttachment,
  type ChatMessage,
  type ChatSenderRole,
} from '@/lib/chat-api'
import { dateLocaleTag } from '@/lib/format-locale'
import MediaLightbox from './MediaLightbox.vue'

const props = defineProps<{
  messages: ChatMessage[]
  viewerRole: ChatSenderRole
  onSend: (body: string, files: File[]) => Promise<void>
  attachmentBasePath: string
  hasMoreOlder?: boolean
  onLoadOlder?: () => Promise<void>
  disabled?: boolean
  placeholder?: string
}>()

const { t } = useI18n()

const draft = ref('')
const pendingFiles = ref<File[]>([])
const isSending = ref(false)
const sendError = ref('')
const attachError = ref('')
const scrollEl = ref<HTMLDivElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const pending = ref<{ clientKey: string; body: string; hasFiles: boolean; beforeIds: Set<number> } | null>(null)
let sendSeq = 0
const resolvedKeys = new Map<number, string>()

interface RenderableMessage {
  key: string
  id: number | null
  body: string | null
  senderRole: ChatSenderRole
  senderFullName: string
  createdAt: string
  attachments: ChatAttachment[]
  status: 'pending' | 'delivered' | 'read'
}

const renderable = computed<RenderableMessage[]>(() => {
  const items: RenderableMessage[] = props.messages.map((m) => ({
    key: resolvedKeys.get(m.id) ?? `m-${m.id}`,
    id: m.id,
    body: m.body,
    senderRole: m.senderRole,
    senderFullName: m.senderFullName,
    createdAt: m.createdAt,
    attachments: m.attachments,
    status: m.read ? 'read' : 'delivered',
  }))
  if (pending.value) {
    items.push({
      key: pending.value.clientKey,
      id: null,
      body: pending.value.body || (pending.value.hasFiles ? t('chat.thread.sendingFile') : ''),
      senderRole: props.viewerRole,
      senderFullName: currentUser.value?.fullName ?? '',
      createdAt: new Date().toISOString(),
      attachments: [],
      status: 'pending',
    })
  }
  return items
})

function dayLabel(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return t('chat.thread.today')
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return t('chat.thread.yesterday')
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }
  if (date.getFullYear() !== now.getFullYear()) options.year = 'numeric'
  return date.toLocaleDateString(dateLocaleTag(), options)
}

const groupedByDay = computed(() => {
  const groups: { label: string; items: RenderableMessage[] }[] = []
  for (const message of renderable.value) {
    const label = dayLabel(message.createdAt)
    const lastGroup = groups[groups.length - 1]
    if (lastGroup?.label === label) {
      lastGroup.items.push(message)
    } else {
      groups.push({ label, items: [message] })
    }
  }
  return groups
})

const firstUnreadId = ref<number | null>(props.messages.find((m) => m.unreadByMe)?.id ?? null)

function scrollToBottom() {
  nextTick(() => {
    if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight
  })
}

onMounted(() => {
  nextTick(() => {
    const target =
      scrollEl.value?.querySelector<HTMLElement>('[data-unread-divider]') ??
      (firstUnreadId.value != null ? scrollEl.value?.querySelector<HTMLElement>(`[data-message-id="${firstUnreadId.value}"]`) : null)
    if (target && scrollEl.value) {
      scrollEl.value.scrollTop += target.getBoundingClientRect().top - scrollEl.value.getBoundingClientRect().top
    } else {
      scrollToBottom()
    }
  })
})

watch(
  () => props.messages,
  (next, prev) => {
    if (isLoadingOlder.value || !prev || prev.length === 0) return
    const appended = next[next.length - 1]?.id !== prev[prev.length - 1]?.id
    if (appended && isNearBottom.value) scrollToBottom()
  },
)

watch(
  () => props.messages.length,
  (next, prev) => {
    if (!pending.value || next <= prev) return
    const p = pending.value
    const match = [...props.messages].reverse().find((m) => m.senderRole === props.viewerRole && !p.beforeIds.has(m.id))
    if (match) resolvedKeys.set(match.id, p.clientKey)
    pending.value = null
  },
)

const isLoadingOlder = ref(false)
const isNearBottom = ref(true)
const NEAR_BOTTOM_THRESHOLD = 120
const NEAR_TOP_THRESHOLD = 80

async function loadOlder() {
  if (!props.onLoadOlder || !props.hasMoreOlder || isLoadingOlder.value) return
  const el = scrollEl.value
  const prevScrollHeight = el?.scrollHeight ?? 0
  const prevScrollTop = el?.scrollTop ?? 0
  isLoadingOlder.value = true
  try {
    await props.onLoadOlder()
    await nextTick()
    if (el) el.scrollTop = prevScrollTop + (el.scrollHeight - prevScrollHeight)
  } finally {
    isLoadingOlder.value = false
  }
}

function onScroll() {
  const el = scrollEl.value
  if (!el) return
  const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
  isNearBottom.value = distanceFromBottom < NEAR_BOTTOM_THRESHOLD
  if (el.scrollTop < NEAR_TOP_THRESHOLD) void loadOlder()
}

function scrollToBottomClicked() {
  isNearBottom.value = true
  scrollToBottom()
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(dateLocaleTag(), { hour: '2-digit', minute: '2-digit' })
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? t('chat.thread.sizeMb', { size: (bytes / (1024 * 1024)).toFixed(1) })
    : t('chat.thread.sizeKb', { size: Math.max(1, Math.round(bytes / 1024)) })
}

function attachmentUrl(attachment: ChatAttachment): string {
  return chatAttachmentUrl(props.attachmentBasePath, attachment.id)
}

const lightboxOpen = ref(false)
const lightboxAttachments = ref<ChatAttachment[]>([])
const lightboxIndex = ref(0)
function openLightbox(attachments: ChatAttachment[], index: number) {
  lightboxAttachments.value = attachments
  lightboxIndex.value = index
  lightboxOpen.value = true
}

const objectUrls = new Map<File, string>()
function previewUrlFor(file: File): string {
  let url = objectUrls.get(file)
  if (!url) {
    url = URL.createObjectURL(file)
    objectUrls.set(file, url)
  }
  return url
}
let nextFileKey = 0
const fileKeys = new WeakMap<File, number>()
function keyFor(file: File): number {
  let key = fileKeys.get(file)
  if (key === undefined) {
    key = nextFileKey++
    fileKeys.set(file, key)
  }
  return key
}

function revokePreviewUrl(file: File) {
  const url = objectUrls.get(file)
  if (url) {
    URL.revokeObjectURL(url)
    objectUrls.delete(file)
  }
}
onBeforeUnmount(() => {
  for (const url of objectUrls.values()) URL.revokeObjectURL(url)
  objectUrls.clear()
})

function openFilePicker() {
  fileInputRef.value?.click()
}

function addFiles(selected: File[]) {
  attachError.value = ''
  if (selected.length === 0) return

  if (pendingFiles.value.length + selected.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    attachError.value = t('chat.thread.attachTooMany', { max: MAX_ATTACHMENTS_PER_MESSAGE })
    return
  }
  for (const file of selected) {
    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')
    if (!isImage && !isVideo) {
      attachError.value = t('chat.thread.attachInvalidType', { name: file.name })
      return
    }
    const max = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES
    if (file.size > max) {
      attachError.value = t('chat.thread.attachTooLarge', { name: file.name, max: Math.round(max / (1024 * 1024)) })
      return
    }
  }
  pendingFiles.value = [...pendingFiles.value, ...selected]
}

function onFilesSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const selected = Array.from(input.files ?? [])
  input.value = ''
  addFiles(selected)
}

function onPaste(event: ClipboardEvent) {
  const items = event.clipboardData?.items
  if (!items) return
  const files: File[] = []
  for (const item of items) {
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    if (file) files.push(file)
  }
  if (files.length === 0) return
  event.preventDefault()
  addFiles(files)
}

function removePendingFile(file: File) {
  revokePreviewUrl(file)
  pendingFiles.value = pendingFiles.value.filter((f) => f !== file)
}

const MAX_TEXTAREA_HEIGHT = 160
function autoGrowTextarea() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`
}
watch(draft, () => nextTick(autoGrowTextarea))

async function send() {
  const body = draft.value.trim()
  if ((!body && pendingFiles.value.length === 0) || isSending.value) return
  sendError.value = ''
  isSending.value = true
  const files = pendingFiles.value
  pending.value = {
    clientKey: `pending-${++sendSeq}`,
    body,
    hasFiles: files.length > 0,
    beforeIds: new Set(props.messages.map((m) => m.id)),
  }
  draft.value = ''
  for (const file of files) revokePreviewUrl(file)
  pendingFiles.value = []
  isNearBottom.value = true
  scrollToBottom()
  try {
    await props.onSend(body, files)
  } catch (error) {
    sendError.value = error instanceof Error ? error.message : String(error)
    pending.value = null
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

const canSend = computed(() => !props.disabled && (draft.value.trim().length > 0 || pendingFiles.value.length > 0))
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="relative flex min-h-0 flex-1 flex-col">
      <div ref="scrollEl" class="flex min-h-0 min-w-0 flex-1 flex-col gap-1 overflow-auto bg-primary/5 p-2 sm:p-4" @scroll="onScroll">
        <div v-if="isLoadingOlder" class="flex items-center gap-2 py-2" role="status" :aria-label="t('entityTable.loading')">
          <Skeleton class="size-10 shrink-0 rounded-full" />
          <div class="w-48 space-y-2"><Skeleton class="h-3 w-2/3" /><Skeleton class="h-8 w-full rounded-2xl" /></div>
          <span class="sr-only">{{ t('entityTable.loading') }}</span>
        </div>
        <p v-if="renderable.length === 0" class="m-auto text-sm text-muted-foreground">{{ t('chat.thread.noMessagesYet') }}</p>

        <div v-for="(group, groupIndex) in groupedByDay" :key="group.label">
          <div class="sticky top-0 z-10 my-3 flex justify-center" :class="groupIndex === 0 ? 'mt-0' : ''">
            <span class="rounded-full border bg-background/95 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
              {{ group.label }}
            </span>
          </div>

          <TransitionGroup name="message-pop" tag="div" class="flex flex-col gap-3">
            <template v-for="message in group.items" :key="message.key">
              <div
                v-if="firstUnreadId !== null && message.id === firstUnreadId"
                key="unread-divider"
                data-unread-divider
                class="my-1 flex items-center gap-3"
              >
                <div class="h-px flex-1 bg-border" />
                <span class="shrink-0 text-xs font-medium text-muted-foreground">{{ t('chat.thread.newMessages') }}</span>
                <div class="h-px flex-1 bg-border" />
              </div>

              <div
                :data-message-id="message.id"
                class="flex min-w-0 items-end gap-2"
                :class="message.senderRole === viewerRole ? 'flex-row-reverse' : ''"
              >
                <Avatar v-if="message.senderFullName" size="sm" :class="avatarColorClasses(message.senderFullName)" class="mb-4 shrink-0">
                  <AvatarFallback :class="avatarColorClasses(message.senderFullName)">{{ initials(message.senderFullName) }}</AvatarFallback>
                </Avatar>
                <div v-else class="w-8 shrink-0" />

                <div class="flex min-w-0 max-w-[85%] flex-col gap-1 sm:max-w-[65%]" :class="message.senderRole === viewerRole ? 'items-end' : 'items-start'">
                  <span v-if="message.senderFullName" class="max-w-full truncate px-1 text-xs font-medium text-muted-foreground">{{ shortName(message.senderFullName) }}</span>

                  <div
                    v-if="message.attachments.length"
                    class="w-64 max-w-full overflow-hidden rounded-2xl"
                    :class="
                      message.senderRole === viewerRole
                        ? 'rounded-tr-sm bg-primary text-primary-foreground'
                        : 'rounded-tl-sm border border-border bg-card text-card-foreground'
                    "
                  >
                    <div class="grid gap-0.5" :class="message.attachments.length > 1 ? 'grid-cols-2' : ''">
                      <button
                        v-for="(attachment, index) in message.attachments"
                        :key="attachment.id"
                        type="button"
                        class="block w-full overflow-hidden transition-transform hover:brightness-95"
                        @click="openLightbox(message.attachments, index)"
                      >
                        <img
                          v-if="attachment.kind === 'IMAGE'"
                          :src="attachmentUrl(attachment)"
                          :alt="attachment.fileName"
                          class="aspect-square w-full object-cover opacity-0 transition-opacity duration-300"
                          @load="($event.target as HTMLImageElement).classList.remove('opacity-0')"
                        />
                        <div v-else class="relative aspect-square w-full bg-black/10">
                          <video
                            :src="attachmentUrl(attachment)"
                            class="h-full w-full object-cover opacity-0 transition-opacity duration-300"
                            @loadeddata="($event.target as HTMLVideoElement).classList.remove('opacity-0')"
                          />
                          <div class="absolute inset-0 flex items-center justify-center bg-black/20">
                            <div class="rounded-full bg-black/50 p-2.5">
                              <FileVideo class="size-5 text-white" />
                            </div>
                          </div>
                        </div>
                      </button>
                    </div>

                    <div v-if="message.body" class="min-w-0 px-3 pt-2 pb-1.5 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
                      <span class="float-right mt-0.5 ml-2 inline-flex items-center gap-0.5 text-[10px] whitespace-nowrap opacity-70">
                        {{ formatTime(message.createdAt) }}
                        <template v-if="message.senderRole === viewerRole">
                          <Check v-if="message.status === 'pending'" class="size-3 opacity-60" />
                          <Check v-else-if="message.status === 'delivered'" class="size-3" />
                          <CheckCheck v-else class="size-3" />
                        </template>
                      </span>
                      {{ message.body }}
                    </div>
                    <div v-else class="flex items-center justify-end gap-0.5 px-3 pt-1 pb-1.5 text-[10px] whitespace-nowrap opacity-70">
                      {{ formatTime(message.createdAt) }}
                      <template v-if="message.senderRole === viewerRole">
                        <Check v-if="message.status === 'pending'" class="size-3 opacity-60" />
                        <Check v-else-if="message.status === 'delivered'" class="size-3" />
                        <CheckCheck v-else class="size-3" />
                      </template>
                    </div>
                  </div>

                  <div
                    v-else-if="message.body"
                    class="min-w-0 max-w-full rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]"
                    :class="
                      message.senderRole === viewerRole
                        ? 'rounded-tr-sm bg-primary text-primary-foreground'
                        : 'rounded-tl-sm border border-border bg-card text-card-foreground'
                    "
                  >
                    {{ message.body }}
                    <span
                      class="ml-2 inline-flex translate-y-0.5 items-center gap-0.5 align-middle text-[10px] whitespace-nowrap opacity-70"
                    >
                      {{ formatTime(message.createdAt) }}
                      <template v-if="message.senderRole === viewerRole">
                        <Check v-if="message.status === 'pending'" class="size-3 opacity-60" />
                        <Check v-else-if="message.status === 'delivered'" class="size-3" />
                        <CheckCheck v-else class="size-3" />
                      </template>
                    </span>
                  </div>
                </div>
              </div>
            </template>
          </TransitionGroup>
        </div>
      </div>

      <button
        v-if="!isNearBottom"
        type="button"
        :aria-label="t('chat.thread.scrollDown')"
        class="absolute right-4 bottom-4 z-20 flex size-10 items-center justify-center rounded-full border bg-card text-foreground shadow-md transition-colors hover:bg-accent"
        @click="scrollToBottomClicked"
      >
        <ArrowDown class="size-4" />
        <span class="sr-only">{{ t('chat.thread.scrollDownSr') }}</span>
      </button>
    </div>

    <div v-if="pendingFiles.length" class="flex flex-wrap gap-2 border-t px-3 pt-3">
      <div v-for="file in pendingFiles" :key="keyFor(file)" class="relative">
        <span class="sr-only">{{ file.name }} ({{ formatSize(file.size) }})</span>
        <img v-if="file.type.startsWith('image/')" :src="previewUrlFor(file)" class="size-16 rounded-md border object-cover" />
        <div v-else class="flex size-16 flex-col items-center justify-center gap-1 rounded-md border bg-muted text-muted-foreground">
          <FileVideo class="size-5" />
        </div>
        <button
          type="button"
          class="absolute -top-1.5 -right-1.5 rounded-full border bg-background p-0.5 shadow-sm hover:bg-muted"
          @click="removePendingFile(file)"
        >
          <X class="size-3" />
          <span class="sr-only">{{ t('chat.thread.removeFile') }}</span>
        </button>
      </div>
    </div>

    <p v-if="attachError" class="px-3 pt-2 text-sm text-red-500">{{ attachError }}</p>
    <p v-if="sendError" class="px-3 pt-2 text-sm text-red-500">{{ sendError }}</p>

    <div class="border-t p-3">
      <input ref="fileInputRef" type="file" multiple accept="image/*,video/*" class="hidden" @change="onFilesSelected" />
      <div class="relative flex items-end rounded-md border border-input bg-background transition-shadow focus-within:border-ring/50 focus-within:ring-4 focus-within:ring-ring/20">
        <button
          type="button"
          :disabled="disabled"
          :aria-label="t('chat.thread.attachFile')"
          class="absolute bottom-1.5 left-1.5 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:pointer-events-none disabled:opacity-50"
          @click="openFilePicker"
        >
          <Paperclip class="size-4" />
          <span class="sr-only">{{ t('chat.thread.attachFile') }}</span>
        </button>
        <textarea
          ref="textareaRef"
          v-model="draft"
          :disabled="disabled"
          :placeholder="placeholder ?? t('chat.thread.messagePlaceholder')"
          rows="1"
          class="max-h-40 min-h-10 w-full resize-none bg-transparent py-2.5 pr-11 pl-11 text-sm placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          @keydown="onKeydown"
          @paste="onPaste"
        />
        <Button
          :disabled="!canSend"
          :loading="isSending"
          variant="ghost"
          size="icon"
          class="absolute right-1.5 bottom-1.5 size-8 text-primary hover:bg-primary/10 hover:text-primary disabled:text-muted-foreground"
          @click="send"
        >
          <SendHorizontal class="size-4" />
        </Button>
      </div>
    </div>

    <MediaLightbox
      v-model:open="lightboxOpen"
      v-model:index="lightboxIndex"
      :attachments="lightboxAttachments"
      :attachment-base-path="attachmentBasePath"
    />
  </div>
</template>

<style scoped>
.message-pop-enter-active {
  transition: all 0.25s ease;
}
.message-pop-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.97);
}
</style>
