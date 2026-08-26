<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDebounceFn } from '@vueuse/core'
import { ChevronDown, FileVideo, Paperclip, Users, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import SearchSelect from '@/components/SearchSelect.vue'
import {
  fetchRecipientFacets,
  fetchRecipients,
  sendBroadcast,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  type ChatRecipient,
  type ChatRecipientFacets,
} from '@/lib/chat-api'
import { parseApiError } from '@/lib/utils'

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'

const emit = defineEmits<{ sent: [] }>()

const { t } = useI18n()

const isDialogOpen = ref(false)
const facets = ref<ChatRecipientFacets | null>(null)
const recipients = ref<ChatRecipient[]>([])
const isLoadingRecipients = ref(false)
const isSending = ref(false)
const dialogError = ref('')

const floors = ref<string[]>([])
const corpus = ref<string>('')
const debtorsOnly = ref(false)
const body = ref('')

// Вложения (2026-08-24, по прямой просьбе) — тот же композер-приём, что в ChatThread.vue
// (fileInputRef+превью+object URL), но один набор файлов физически копируется на каждого
// получателя рассылки (см. broadcast() на бэке) — тут это просто список выбранных файлов.
const pendingFiles = ref<File[]>([])
const attachError = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)
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
function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? t('chat.thread.sizeMb', { size: (bytes / (1024 * 1024)).toFixed(1) })
    : t('chat.thread.sizeKb', { size: Math.max(1, Math.round(bytes / 1024)) })
}

// Явно выбранные получатели по ФИО-поиску ("написать 3 конкретным людям", по прямой
// просьбе) — если непусто, ПОЛНОСТЬЮ заменяет фильтры этаж/корпус/должники (не
// пересекается с ними), см. submit()/refreshRecipients() ниже и chat-recipients.ts на бэке.
const pickedIndividuals = ref<ChatRecipient[]>([])
const hasExplicitPicks = computed(() => pickedIndividuals.value.length > 0)

const personQuery = ref('')
const personSearchResults = ref<ChatRecipient[]>([])

async function searchPeople(query: string) {
  const trimmed = query.trim()
  if (!trimmed) {
    personSearchResults.value = []
    return
  }
  const pickedUids = new Set(pickedIndividuals.value.map((p) => p.individualUid))
  const results = await fetchRecipients({ search: trimmed })
  personSearchResults.value = results.filter((r) => !pickedUids.has(r.individualUid))
}
const debouncedSearchPeople = useDebounceFn(searchPeople, 300)

function pickPerson(person: ChatRecipient) {
  pickedIndividuals.value.push(person)
  personQuery.value = ''
  personSearchResults.value = []
  recipients.value = [...pickedIndividuals.value]
}

function removePerson(uid: string) {
  pickedIndividuals.value = pickedIndividuals.value.filter((p) => p.individualUid !== uid)
  if (pickedIndividuals.value.length > 0) {
    recipients.value = [...pickedIndividuals.value]
  } else {
    refreshRecipients()
  }
}

function toggleFloor(value: string, checked: boolean) {
  floors.value = checked ? [...floors.value, value] : floors.value.filter((f) => f !== value)
}

async function refreshRecipients() {
  // Явные выборы уже полный список сам по себе — доп. запрос не нужен, повторно
  // используем то, что уже есть на руках (см. pickPerson/removePerson).
  if (hasExplicitPicks.value) {
    recipients.value = [...pickedIndividuals.value]
    return
  }
  isLoadingRecipients.value = true
  try {
    recipients.value = await fetchRecipients({
      floors: floors.value.length ? floors.value : undefined,
      corpus: corpus.value || undefined,
      debtorsOnly: debtorsOnly.value || undefined,
    })
  } catch {
    recipients.value = []
  } finally {
    isLoadingRecipients.value = false
  }
}

watch([floors, corpus, debtorsOnly], refreshRecipients)

async function open() {
  dialogError.value = ''
  floors.value = []
  corpus.value = ''
  debtorsOnly.value = false
  body.value = ''
  pickedIndividuals.value = []
  personQuery.value = ''
  personSearchResults.value = []
  recipients.value = []
  for (const file of pendingFiles.value) revokePreviewUrl(file)
  pendingFiles.value = []
  attachError.value = ''
  isDialogOpen.value = true

  facets.value = await fetchRecipientFacets()
  await refreshRecipients()
}

defineExpose({ open })

async function submit() {
  dialogError.value = ''
  if (!body.value.trim()) {
    dialogError.value = t('chat.broadcast.emptyBody')
    return
  }
  if (recipients.value.length === 0) {
    dialogError.value = t('chat.broadcast.noRecipients')
    return
  }

  isSending.value = true
  try {
    await sendBroadcast(
      body.value.trim(),
      hasExplicitPicks.value
        ? { individualUids: pickedIndividuals.value.map((p) => p.individualUid) }
        : {
            floors: floors.value.length ? floors.value : undefined,
            corpus: corpus.value || undefined,
            debtorsOnly: debtorsOnly.value || undefined,
          },
      pendingFiles.value,
    )
    isDialogOpen.value = false
    emit('sent')
  } catch (error) {
    dialogError.value = parseApiError(error).message
  } finally {
    isSending.value = false
  }
}
</script>

<template>
  <Dialog :open="isDialogOpen" @update:open="(v) => (isDialogOpen = v)">
    <DialogScrollContent :class="['flex flex-col gap-4 sm:max-w-lg', DIALOG_ANIMATE_CLASS]">
      <DialogHeader>
        <DialogTitle>{{ t('chat.list.newMessage') }}</DialogTitle>
      </DialogHeader>

      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <Label>{{ t('chat.broadcast.specificPeopleLabel') }}</Label>
          <SearchSelect
            v-model="personQuery"
            :items="personSearchResults"
            :item-key="(p: ChatRecipient) => p.individualUid"
            :item-label="(p: ChatRecipient) => p.fullName"
            :item-sub-label="(p: ChatRecipient) => p.room ?? ''"
            :placeholder="t('chat.broadcast.specificPeoplePlaceholder')"
            @search="debouncedSearchPeople"
            @select="pickPerson"
          />
          <div v-if="pickedIndividuals.length" class="flex flex-wrap gap-1.5">
            <span
              v-for="p in pickedIndividuals"
              :key="p.individualUid"
              class="flex items-center gap-1 rounded-full border bg-muted py-1 pl-2.5 pr-1 text-xs"
            >
              {{ p.fullName }}
              <button type="button" class="rounded-full p-0.5 hover:bg-background" @click="removePerson(p.individualUid)">
                <X class="size-3" />
                <span class="sr-only">{{ t('chat.broadcast.removePerson', { name: p.fullName }) }}</span>
              </button>
            </span>
          </div>
        </div>

        <p v-if="hasExplicitPicks" class="text-xs text-muted-foreground">
          {{ t('chat.broadcast.explicitPicksHint') }}
        </p>

        <div class="grid grid-cols-2 gap-4" :class="hasExplicitPicks ? 'opacity-50' : ''">
          <div class="flex flex-col gap-2">
            <Label>{{ t('chat.broadcast.floorLabel') }}</Label>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="outline" class="w-full justify-between font-normal" :disabled="hasExplicitPicks">
                  <span class="truncate">{{ floors.length ? floors.join(', ') : t('chat.broadcast.allFloors') }}</span>
                  <ChevronDown class="size-4 shrink-0 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent class="w-56">
                <DropdownMenuCheckboxItem
                  v-for="value in facets?.floors ?? []"
                  :key="value"
                  :model-value="floors.includes(value)"
                  @select.prevent
                  @update:model-value="(v) => toggleFloor(value, !!v)"
                >
                  {{ value }}
                </DropdownMenuCheckboxItem>
                <div v-if="!facets?.floors.length" class="px-2 py-1.5 text-sm text-muted-foreground">{{ t('chat.broadcast.noFloorData') }}</div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div class="flex flex-col gap-2">
            <Label>{{ t('chat.broadcast.corpusLabel') }}</Label>
            <Select
              :model-value="corpus || undefined"
              :disabled="hasExplicitPicks || !facets?.corpusAvailable"
              @update:model-value="(v) => (corpus = (v as string) ?? '')"
            >
              <SelectTrigger>
                <SelectValue :placeholder="facets?.corpusAvailable ? t('chat.broadcast.allCorpuses') : t('chat.broadcast.corpusNotSet')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="value in facets?.corpuses ?? []" :key="value" :value="value">{{ value }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div
          class="flex cursor-pointer items-center gap-2 rounded-md p-1"
          :class="hasExplicitPicks ? 'pointer-events-none opacity-50' : ''"
          @click="debtorsOnly = !debtorsOnly"
        >
          <Checkbox :model-value="debtorsOnly" />
          <Label class="cursor-pointer font-normal">
            {{ t('chat.broadcast.debtorsOnly') }}<span v-if="facets"> ({{ facets.debtorsCount }})</span>
          </Label>
        </div>

        <div class="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          <Users class="size-4 shrink-0" />
          <span v-if="isLoadingRecipients">{{ t('chat.broadcast.countingRecipients') }}</span>
          <span v-else>{{ t('chat.broadcast.willReceive', { count: recipients.length }) }}</span>
        </div>

        <div class="flex flex-col gap-2">
          <Label>{{ t('chat.broadcast.messageLabel') }}</Label>
          <textarea
            v-model="body"
            rows="4"
            :placeholder="t('chat.broadcast.messagePlaceholder')"
            class="flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground transition-shadow focus-visible:outline-none focus-visible:border-ring/50 focus-visible:ring-4 focus-visible:ring-ring/20 focus-visible:shadow-sm"
          />

          <input ref="fileInputRef" type="file" multiple accept="image/*,video/*" class="hidden" @change="onFilesSelected" />
          <div class="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" @click="openFilePicker">
              <Paperclip class="size-4" />
              {{ t('chat.thread.attachFile') }}
            </Button>
            <span class="text-xs text-muted-foreground">{{ t('chat.broadcast.attachHint') }}</span>
          </div>
          <div v-if="pendingFiles.length" class="flex flex-wrap gap-2">
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
          <p v-if="attachError" class="text-sm text-red-500">{{ attachError }}</p>
        </div>
      </div>

      <DialogFooter>
        <p v-if="dialogError" class="mr-auto self-center text-sm text-red-500">{{ dialogError }}</p>
        <Button :loading="isSending" :disabled="recipients.length === 0" @click="submit">{{ t('chat.broadcast.send') }}</Button>
      </DialogFooter>
    </DialogScrollContent>
  </Dialog>
</template>
