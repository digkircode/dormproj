<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { FileVideo, Paperclip, SendHorizontal, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  chatAttachmentUrl,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  type ChatAttachment,
  type ChatMessage,
  type ChatSenderRole,
} from '@/lib/chat-api'

// Общий для обеих сторон компонент — какая сторона выравнивается вправо ("свои"
// сообщения), определяет viewerRole, а не жёстко STAFF/RESIDENT. Имя отправителя
// показывается всегда, над каждым сообщением, независимо от того, чьё оно (по прямому
// требованию ТЗ) — это позволяет в общем инбоксе сотрудников видеть, кто именно из
// команды ответил, а не только "Сотрудник".
// onSend — асинхронная функция, а не emit: emit() не дожидается промиса слушателя,
// поэтому isSending/очистка черновика не могли бы отражать реальный результат отправки
// (индикатор гас бы мгновенно, а текст/файлы стирались бы даже при ошибке сети).
const props = defineProps<{
  messages: ChatMessage[]
  viewerRole: ChatSenderRole
  onSend: (body: string, files: File[]) => Promise<void>
  // '/chats/attachments' у сотрудников или '/my-chat/attachments' у проживающего —
  // доступ к файлу проверяется по-разному на бэке (см. chats.controller.ts/my-chat.controller.ts).
  attachmentBasePath: string
  disabled?: boolean
  placeholder?: string
}>()

const draft = ref('')
const pendingFiles = ref<File[]>([])
const isSending = ref(false)
const sendError = ref('')
const attachError = ref('')
const scrollEl = ref<HTMLDivElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

function scrollToBottom() {
  nextTick(() => {
    if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight
  })
}

watch(
  () => props.messages.length,
  () => scrollToBottom(),
)

function formatTime(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  if (isToday) {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} МБ` : `${Math.max(1, Math.round(bytes / 1024))} КБ`
}

function attachmentUrl(attachment: ChatAttachment): string {
  return chatAttachmentUrl(props.attachmentBasePath, attachment.id)
}

// Только для превью в композере (см. previews ниже) — object URL живёт, пока файл не
// отправлен/не убран, освобождается явно (revokeObjectURL), иначе течёт память при
// долгой сессии с частым выбором/отменой файлов.
const objectUrls = new Map<File, string>()
function previewUrlFor(file: File): string {
  let url = objectUrls.get(file)
  if (!url) {
    url = URL.createObjectURL(file)
    objectUrls.set(file, url)
  }
  return url
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

function onFilesSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const selected = Array.from(input.files ?? [])
  input.value = ''
  attachError.value = ''

  if (pendingFiles.value.length + selected.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    attachError.value = `Не больше ${MAX_ATTACHMENTS_PER_MESSAGE} файлов в одном сообщении`
    return
  }
  for (const file of selected) {
    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')
    if (!isImage && !isVideo) {
      attachError.value = `«${file.name}» — недопустимый тип файла`
      return
    }
    const max = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES
    if (file.size > max) {
      attachError.value = `«${file.name}» больше ${Math.round(max / (1024 * 1024))} МБ`
      return
    }
  }
  pendingFiles.value = [...pendingFiles.value, ...selected]
}

function removePendingFile(file: File) {
  revokePreviewUrl(file)
  pendingFiles.value = pendingFiles.value.filter((f) => f !== file)
}

async function send() {
  const body = draft.value.trim()
  if ((!body && pendingFiles.value.length === 0) || isSending.value) return
  sendError.value = ''
  isSending.value = true
  try {
    await props.onSend(body, pendingFiles.value)
    draft.value = ''
    for (const file of pendingFiles.value) revokePreviewUrl(file)
    pendingFiles.value = []
  } catch (error) {
    sendError.value = error instanceof Error ? error.message : String(error)
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
  <div class="flex min-h-0 flex-1 flex-col">
    <div ref="scrollEl" class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
      <p v-if="messages.length === 0" class="m-auto text-sm text-muted-foreground">Сообщений пока нет</p>
      <div
        v-for="message in messages"
        :key="message.id"
        class="flex flex-col gap-1"
        :class="message.senderRole === viewerRole ? 'items-end' : 'items-start'"
      >
        <span class="px-1 text-xs font-medium text-muted-foreground">{{ message.senderFullName }}</span>
        <div v-if="message.attachments.length" class="flex max-w-[70%] flex-wrap gap-1.5">
          <a v-for="attachment in message.attachments" :key="attachment.id" :href="attachmentUrl(attachment)" target="_blank">
            <img
              v-if="attachment.kind === 'IMAGE'"
              :src="attachmentUrl(attachment)"
              :alt="attachment.fileName"
              class="max-h-64 max-w-64 rounded-lg border object-cover"
            />
            <video v-else :src="attachmentUrl(attachment)" controls class="max-h-64 max-w-64 rounded-lg border" />
          </a>
        </div>
        <div
          v-if="message.body"
          class="max-w-[70%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap"
          :class="
            message.senderRole === viewerRole
              ? 'rounded-tr-sm bg-primary text-primary-foreground'
              : 'rounded-tl-sm bg-muted text-foreground'
          "
        >
          {{ message.body }}
        </div>
        <span class="px-1 text-xs text-muted-foreground">{{ formatTime(message.createdAt) }}</span>
      </div>
    </div>

    <div v-if="pendingFiles.length" class="flex flex-wrap gap-2 border-t px-3 pt-3">
      <div v-for="file in pendingFiles" :key="file.name + file.size" class="relative" :title="`${file.name} (${formatSize(file.size)})`">
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
          <span class="sr-only">Убрать файл</span>
        </button>
      </div>
    </div>

    <p v-if="attachError" class="px-3 pt-2 text-sm text-red-500">{{ attachError }}</p>
    <p v-if="sendError" class="px-3 pt-2 text-sm text-red-500">{{ sendError }}</p>

    <div class="flex items-end gap-2 border-t p-3">
      <input ref="fileInputRef" type="file" multiple accept="image/*,video/*" class="hidden" @change="onFilesSelected" />
      <Button variant="outline" size="icon" :disabled="disabled" @click="openFilePicker">
        <Paperclip class="size-4" />
        <span class="sr-only">Прикрепить файл</span>
      </Button>
      <textarea
        v-model="draft"
        :disabled="disabled"
        :placeholder="placeholder ?? 'Написать сообщение...'"
        rows="2"
        class="flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground transition-shadow focus-visible:outline-none focus-visible:border-ring/50 focus-visible:ring-4 focus-visible:ring-ring/20 focus-visible:shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
        @keydown="onKeydown"
      />
      <Button :disabled="!canSend" :loading="isSending" size="icon" @click="send">
        <SendHorizontal class="size-4" />
      </Button>
    </div>
  </div>
</template>
