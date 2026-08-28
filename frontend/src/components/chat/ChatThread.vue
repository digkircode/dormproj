<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ArrowDown, Check, CheckCheck, FileVideo, Loader, Paperclip, SendHorizontal, X } from 'lucide-vue-next'
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
  // Пагинация истории (2026-08-24) — родитель (Chats.vue/MyChat.vue) владеет массивом
  // messages и знает, есть ли более старая страница; этот компонент только просит
  // подгрузить её по скроллу вверх, см. loadOlder() ниже.
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

// Оптимистичное сообщение — рисуется сразу при нажатии "Отправить", пока идёт запрос
// (статус "sending", 1 невзрачная галочка). clientKey/beforeIds — не для отображения, а
// чтобы потом опознать "то самое" настоящее сообщение среди props.messages и подменить
// его БЕЗ анимации, см. resolvedKeys/watch ниже. beforeIds — снимок id'шников ДО отправки
// (не сравнение по времени: часы клиента и сервера не синхронизированы, сравнение
// createdAt клиента с created сервера в первой версии этого фикса не срабатывало
// практически никогда — pending так и не находил себе пару, "перезагрузка" оставалась).
const pending = ref<{ clientKey: string; body: string; hasFiles: boolean; beforeIds: Set<number> } | null>(null)
let sendSeq = 0
// messageId -> ключ, под которым это сообщение уже показывалось как pending. Не reactive
// (обычный Map, не ref) — читается только внутри renderable, который и так пересчитается
// вместе с обнулением pending.value ниже в том же тике.
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
    // Сообщение, которое только что было pending-пузырём — рендерим под ТЕМ ЖЕ ключом,
    // что и pending (см. resolvedKeys/watch ниже). Иначе TransitionGroup видит смену
    // ключа 'pending' -> 'm-<id>' как удаление одного элемента и вставку другого — и
    // проигрывает enter-анимацию (всплытие+масштаб) на настоящем сообщении, хотя оно
    // визуально должно было просто "проявиться на месте" без скачка.
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
      // Своё же ФИО — то же самое, что подставит настоящее сообщение после отправки
      // (senderFullName от сервера будет тем же именем). Раньше здесь была пустая строка,
      // из-за чего аватарка+подпись отсутствовали у pending-пузыря и "выскакивали" только
      // у настоящего сообщения — заметный скачок вёрстки при подмене.
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

// Снимок "первое непрочитанное лично мной" — считается ОДИН РАЗ при открытии диалога
// (props.messages на момент создания компонента; т.к. родитель монтирует ChatThread
// заново на каждый выбранный диалог через :key, это и есть "на момент открытия"), не
// пересчитывается по ходу сессии — иначе разделитель "прыгал" бы при каждом новом
// сообщении, которое сам же родитель считает уже прочитанным (see chats.controller.ts).
const firstUnreadId = ref<number | null>(props.messages.find((m) => m.unreadByMe)?.id ?? null)

function scrollToBottom() {
  nextTick(() => {
    if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight
  })
}

// При открытии — либо к первому непрочитанному (если есть), либо, как раньше, в самый
// низ. scrollIntoView сразу без плавной анимации (block:'start') — это открытие
// диалога, не жест пользователя, дёрганый smooth-скролл тут ни к чему. Цель —
// САМ разделитель "Новые сообщения" (data-unread-divider), а не сообщение под ним:
// тот рендерится ПЕРЕД сообщением в разметке, и scrollIntoView по самому сообщению
// уводил разделитель выше верхней границы видимой области — он существовал, но не был
// виден при открытии (реальный баг, "точка входа есть, а подписи над ней не видно").
onMounted(() => {
  nextTick(() => {
    const target =
      scrollEl.value?.querySelector<HTMLElement>('[data-unread-divider]') ??
      (firstUnreadId.value != null ? scrollEl.value?.querySelector<HTMLElement>(`[data-message-id="${firstUnreadId.value}"]`) : null)
    if (target) {
      target.scrollIntoView({ block: 'start' })
    } else {
      scrollToBottom()
    }
  })
})

// Автоскролл вниз при появлении НОВОГО сообщения (не истории сверху, см. isLoadingOlder
// ниже) — только если пользователь и так был у низа переписки (isNearBottom). Если он
// отлистал вверх читать историю, новое сообщение снизу не должно дёргать его скролл —
// вместо этого появляется кнопка "вниз" (см. showScrollToBottomButton).
watch(
  () => props.messages,
  (next, prev) => {
    if (isLoadingOlder.value || !prev || prev.length === 0) return
    const appended = next[next.length - 1]?.id !== prev[prev.length - 1]?.id
    if (appended && isNearBottom.value) scrollToBottom()
  },
)

// Убирает оптимистичное сообщение, как только родитель дозагрузил реальный список
// (messages.length выросло), И одновременно запоминает, под каким ключом настоящее
// сообщение должно унаследовать вид pending-пузыря (см. resolvedKeys/renderable выше) —
// это и убирает "скачок как будто перезагрузилось": TransitionGroup видит один и тот же
// ключ до и после, значит просто патчит содержимое элемента на месте, без enter/leave-
// анимации. Совпадение — по id, которого не было в beforeIds (снимок ДО отправки) И
// своей роли (senderRole), а не по времени — сравнение часов клиента/сервера ненадёжно.
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

// --- Скролл: подгрузка истории вверх + кнопка "вниз" ---
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
    // Подгруженные сверху сообщения увеличили scrollHeight — без коррекции видимая
    // область визуально "прыгнула" бы вниз на эту разницу. Компенсируем, чтобы то же
    // сообщение осталось под курсором/взглядом.
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
  pending.value = {
    clientKey: `pending-${++sendSeq}`,
    body,
    hasFiles: files.length > 0,
    beforeIds: new Set(props.messages.map((m) => m.id)),
  }
  // Очищаем поле сразу, не дожидаясь ответа сервера (как в любом мессенджере) — раньше
  // текст пропадал только ПОСЛЕ await props.onSend(), а если тот падал уже после
  // фактической отправки (например на дозагрузке списка диалогов), поле так и оставалось
  // с уже отправленным текстом.
  draft.value = ''
  for (const file of files) revokePreviewUrl(file)
  pendingFiles.value = []
  // Своя отправка — всегда к низу, даже если до этого читали историю выше.
  isNearBottom.value = true
  scrollToBottom()
  try {
    await props.onSend(body, files)
    // pending.value уже обнулён (или вот-вот обнулится) watch'ем на props.messages.length
    // выше — не трогаем его здесь, иначе снова словим ключ 'pending-N', уже не совпадающий
    // с тем, что достался настоящему сообщению.
  } catch (error) {
    sendError.value = error instanceof Error ? error.message : String(error)
    // А вот тут обнулить обязательно — если запрос не долетел, watch никогда не сработает
    // (messages.length не изменится), пузырь иначе завис бы в "отправляется" навсегда.
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
  <div class="flex min-h-0 flex-1 flex-col">
    <!-- relative — якорь для абсолютно спозиционированной кнопки "вниз" внутри именно
         области сообщений (не всего композера/подвала). -->
    <div class="relative flex min-h-0 flex-1 flex-col">
      <!-- Лёгкая tint-подложка под primary — по прямой просьбе, полотно переписки не должно
           сливаться с bg-background/bg-card основного тела сайта. bg-muted тут не годится —
           "непрочитанные"/"чужие" пузыри и так уже bg-muted (см. ниже), сплошной bg-muted на
           подложке слил бы их с фоном. Оттенок primary/5 — не соревнуется с серой парой
           muted/accent/background (см. известную ловушку проекта — они почти неотличимы), а
           работает и в тёмной теме без отдельного dark:-варианта. -->
      <div ref="scrollEl" class="flex min-h-0 flex-1 flex-col gap-1 overflow-auto bg-primary/5 p-4" @scroll="onScroll">
        <div v-if="isLoadingOlder" class="flex justify-center py-2">
          <Loader class="size-4 animate-spin text-muted-foreground" />
        </div>
        <p v-if="renderable.length === 0" class="m-auto text-sm text-muted-foreground">{{ t('chat.thread.noMessagesYet') }}</p>

        <!-- Обёртка на каждую дату обязательна (не bare <template>) — sticky-заголовок
             "прилипает" в пределах ближайшего блочного предка, а не просто scroll-контейнера.
             Без общей обёртки заголовок+сообщения все даты делят один и тот же containing
             block (сам scrollEl) и несколько прилипших плашек могли встать друг на друга
             одновременно (реальный баг, поймано на скриншоте — две плашки дат внахлёст).
             С обёрткой на каждую группу плашка естественно выталкивается началом следующей
             группы, ровно как задумано. -->
        <div v-for="(group, groupIndex) in groupedByDay" :key="group.label">
          <div class="sticky top-0 z-10 my-3 flex justify-center" :class="groupIndex === 0 ? 'mt-0' : ''">
            <span class="rounded-full border bg-background/95 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
              {{ group.label }}
            </span>
          </div>

          <TransitionGroup name="message-pop" tag="div" class="flex flex-col gap-3">
            <template v-for="message in group.items" :key="message.key">
              <!-- Разделитель "новые сообщения" — перед тем сообщением, что было первым
                   непрочитанным на момент открытия (см. firstUnreadId, снимок один раз). -->
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
                class="flex items-end gap-2"
                :class="message.senderRole === viewerRole ? 'flex-row-reverse' : ''"
              >
                <Avatar v-if="message.senderFullName" size="sm" :class="avatarColorClasses(message.senderFullName)" class="mb-4 shrink-0">
                  <AvatarFallback :class="avatarColorClasses(message.senderFullName)">{{ initials(message.senderFullName) }}</AvatarFallback>
                </Avatar>
                <div v-else class="w-8 shrink-0" />

                <!-- max-w — 85% на узком экране (65% от 375px читалось бы слишком тесно
                     для многострочных сообщений), обратно к прежним 65% с чуть более
                     широкого экрана, где это уже не проблема. -->
                <div class="flex max-w-[85%] flex-col gap-1 sm:max-w-[65%]" :class="message.senderRole === viewerRole ? 'items-end' : 'items-start'">
                  <span v-if="message.senderFullName" class="px-1 text-xs font-medium text-muted-foreground">{{ shortName(message.senderFullName) }}</span>

                  <!-- Вложения + подпись — единое "облачко" (по прямой просьбе, как в Telegram):
                       картинка/видео и текст под ней делят одну и ту же ширину контейнера, а не
                       раздельные пузыри разной ширины (текстовый — по длине текста, вложение — по
                       своему intrinsic-размеру). -->
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

                    <!-- Время/галочки — float-right: контейнер тут ФИКСИРОВАННОЙ ширины (w-64,
                         под вложение), поэтому короткая подпись с inline-span "сразу после
                         текста" (как у текстового пузыря ниже, тот сам сжимается по контенту)
                         оставляла бы время висеть посреди пустой синей полосы, а не у правого
                         края. float у времени + обычный текст ПОСЛЕ него в разметке — текст
                         обтекает время, прижимая его к правому краю на своей строке. -->
                    <div v-if="message.body" class="px-3 pt-2 pb-1.5 text-sm whitespace-pre-wrap">
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
                    class="rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap"
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

      <!-- Кнопка "вниз" — по прямой просьбе, появляется, когда пользователь отлистал от
           низа переписки (см. isNearBottom/onScroll). Размер и отступ — как у аватарок
           сообщений (Avatar size="sm" = size-10, см. avatarVariant в ui/avatar/index.ts)
           и того же p-4/mb-4, что и у самих сообщений — кнопка визуально встаёт на место,
           где была бы аватарка последнего сообщения. -->
      <button
        v-if="!isNearBottom"
        type="button"
        :title="t('chat.thread.scrollDown')"
        class="absolute right-4 bottom-4 z-20 flex size-10 items-center justify-center rounded-full border bg-card text-foreground shadow-md transition-colors hover:bg-accent"
        @click="scrollToBottomClicked"
      >
        <ArrowDown class="size-4" />
        <span class="sr-only">{{ t('chat.thread.scrollDownSr') }}</span>
      </button>
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
          <span class="sr-only">{{ t('chat.thread.removeFile') }}</span>
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
          :title="t('chat.thread.attachFile')"
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
