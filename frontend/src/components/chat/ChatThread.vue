<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Check, CheckCheck, FileVideo, Paperclip, SendHorizontal, X } from 'lucide-vue-next'
import { avatarColorClasses, initials } from '@/lib/avatar-color'
import {
  chatAttachmentUrl,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  type ChatAttachment,
  type ChatMessage,
  type ChatSenderRole,
} from '@/lib/chat-api'
import MediaLightbox from './MediaLightbox.vue'

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
const textareaRef = ref<HTMLTextAreaElement | null>(null)

// Оптимистичное сообщение — рисуется сразу при нажатии "Отправить", пока идёт запрос
// (статус "sending", 1 невзрачная галочка), убирается, как только props.onSend()
// зарезолвится: к этому моменту у обеих Chats.vue/MyChat.vue onSend уже успевает
// перезапросить реальные сообщения, так что настоящее (со статусом delivered) уже
// будет в props.messages к моменту, когда pending пропадает — подмены не видно.
const pending = ref<{ body: string; hasFiles: boolean } | null>(null)

interface RenderableMessage {
  key: string
  body: string | null
  senderRole: ChatSenderRole
  senderFullName: string
  createdAt: string
  attachments: ChatAttachment[]
  status: 'pending' | 'delivered' | 'read'
}

const renderable = computed<RenderableMessage[]>(() => {
  const items: RenderableMessage[] = props.messages.map((m) => ({
    key: `m-${m.id}`,
    body: m.body,
    senderRole: m.senderRole,
    senderFullName: m.senderFullName,
    createdAt: m.createdAt,
    attachments: m.attachments,
    status: m.read ? 'read' : 'delivered',
  }))
  if (pending.value) {
    items.push({
      key: 'pending',
      body: pending.value.body || (pending.value.hasFiles ? '📎 Отправка файла…' : ''),
      senderRole: props.viewerRole,
      senderFullName: '',
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
  if (date.toDateString() === now.toDateString()) return 'Сегодня'
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'Вчера'
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }
  if (date.getFullYear() !== now.getFullYear()) options.year = 'numeric'
  return date.toLocaleDateString('ru-RU', options)
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

function scrollToBottom() {
  nextTick(() => {
    if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight
  })
}

watch(
  () => [props.messages.length, pending.value],
  () => scrollToBottom(),
)

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} МБ` : `${Math.max(1, Math.round(bytes / 1024))} КБ`
}

function attachmentUrl(attachment: ChatAttachment): string {
  return chatAttachmentUrl(props.attachmentBasePath, attachment.id)
}

// Лайтбокс открывается на файлах конкретного сообщения (не всей переписки сразу) —
// проще предсказать, что покажут стрелки "вперёд/назад".
const lightboxOpen = ref(false)
const lightboxAttachments = ref<ChatAttachment[]>([])
const lightboxIndex = ref(0)
function openLightbox(attachments: ChatAttachment[], index: number) {
  lightboxAttachments.value = attachments
  lightboxIndex.value = index
  lightboxOpen.value = true
}

// Только для превью В КОМПОЗЕРЕ (см. pendingFiles ниже) — object URL живёт, пока файл
// не отправлен/не убран, освобождается явно (revokeObjectURL), иначе течёт память при
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

// Растёт вслед за текстом до 8 строк примерно (см. MAX_TEXTAREA_HEIGHT), дальше —
// внутренний скролл самого поля, не бесконечное разрастание композера.
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
  pending.value = { body, hasFiles: files.length > 0 }
  try {
    await props.onSend(body, files)
    draft.value = ''
    for (const file of files) revokePreviewUrl(file)
    pendingFiles.value = []
  } catch (error) {
    sendError.value = error instanceof Error ? error.message : String(error)
  } finally {
    pending.value = null
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
    <div ref="scrollEl" class="flex min-h-0 flex-1 flex-col gap-1 overflow-auto p-4">
      <p v-if="renderable.length === 0" class="m-auto text-sm text-muted-foreground">Сообщений пока нет</p>

      <template v-for="group in groupedByDay" :key="group.label">
        <div class="my-3 flex items-center gap-3 first:mt-0">
          <div class="h-px flex-1 bg-border" />
          <span class="shrink-0 text-xs font-medium text-muted-foreground">{{ group.label }}</span>
          <div class="h-px flex-1 bg-border" />
        </div>

        <TransitionGroup name="message-pop" tag="div" class="flex flex-col gap-3">
          <div
            v-for="message in group.items"
            :key="message.key"
            class="flex items-end gap-2"
            :class="message.senderRole === viewerRole ? 'flex-row-reverse' : ''"
          >
            <Avatar v-if="message.senderFullName" size="sm" :class="avatarColorClasses(message.senderFullName)" class="mb-4 shrink-0">
              <AvatarFallback :class="avatarColorClasses(message.senderFullName)">{{ initials(message.senderFullName) }}</AvatarFallback>
            </Avatar>
            <div v-else class="w-8 shrink-0" />

            <div class="flex max-w-[65%] flex-col gap-1" :class="message.senderRole === viewerRole ? 'items-end' : 'items-start'">
              <span v-if="message.senderFullName" class="px-1 text-xs font-medium text-muted-foreground">{{ message.senderFullName }}</span>

              <div v-if="message.attachments.length" class="flex flex-wrap gap-1.5">
                <button
                  v-for="(attachment, index) in message.attachments"
                  :key="attachment.id"
                  type="button"
                  class="block overflow-hidden rounded-lg border transition-transform hover:scale-[1.02]"
                  @click="openLightbox(message.attachments, index)"
                >
                  <img
                    v-if="attachment.kind === 'IMAGE'"
                    :src="attachmentUrl(attachment)"
                    :alt="attachment.fileName"
                    class="max-h-64 max-w-64 object-cover"
                  />
                  <div v-else class="relative">
                    <video :src="attachmentUrl(attachment)" class="max-h-64 max-w-64" />
                    <div class="absolute inset-0 flex items-center justify-center bg-black/20">
                      <div class="rounded-full bg-black/50 p-2.5">
                        <FileVideo class="size-5 text-white" />
                      </div>
                    </div>
                  </div>
                </button>
              </div>

              <div
                v-if="message.body"
                class="rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap"
                :class="
                  message.senderRole === viewerRole
                    ? 'rounded-tr-sm bg-primary text-primary-foreground'
                    : 'rounded-tl-sm bg-muted text-foreground'
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
              <div v-else-if="message.attachments.length" class="flex items-center gap-1 px-1 text-[10px] text-muted-foreground">
                {{ formatTime(message.createdAt) }}
                <template v-if="message.senderRole === viewerRole">
                  <Check v-if="message.status === 'pending'" class="size-3 opacity-60" />
                  <Check v-else-if="message.status === 'delivered'" class="size-3" />
                  <CheckCheck v-else class="size-3" />
                </template>
              </div>
            </div>
          </div>
        </TransitionGroup>
      </template>
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

    <div class="border-t p-3">
      <input ref="fileInputRef" type="file" multiple accept="image/*,video/*" class="hidden" @change="onFilesSelected" />
      <!-- Кнопки прикрепления/отправки — внутри самого поля (по прямой просьбе), не
           соседи-флексбоксы: textarea получает padding под них, кнопки — absolute. -->
      <div class="relative flex items-end rounded-md border border-input bg-background transition-shadow focus-within:border-ring/50 focus-within:ring-4 focus-within:ring-ring/20">
        <button
          type="button"
          :disabled="disabled"
          title="Прикрепить файл"
          class="absolute bottom-1.5 left-1.5 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:pointer-events-none disabled:opacity-50"
          @click="openFilePicker"
        >
          <Paperclip class="size-4" />
          <span class="sr-only">Прикрепить файл</span>
        </button>
        <textarea
          ref="textareaRef"
          v-model="draft"
          :disabled="disabled"
          :placeholder="placeholder ?? 'Написать сообщение...'"
          rows="1"
          class="max-h-40 min-h-10 w-full resize-none bg-transparent py-2.5 pr-11 pl-11 text-sm placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          @keydown="onKeydown"
        />
        <Button
          :disabled="!canSend"
          :loading="isSending"
          size="icon"
          class="absolute right-1.5 bottom-1.5 size-8"
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
/* Новое сообщение всплывает и подрастает, а не появляется мгновенным "скачком" —
   то самое "оживление" интерфейса. */
.message-pop-enter-active {
  transition: all 0.25s ease;
}
.message-pop-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.97);
}
</style>
