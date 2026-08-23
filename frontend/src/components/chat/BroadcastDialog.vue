<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { ChevronDown, Users, X } from 'lucide-vue-next'
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
  type ChatRecipient,
  type ChatRecipientFacets,
} from '@/lib/chat-api'
import { parseApiError } from '@/lib/utils'

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'

const emit = defineEmits<{ sent: [] }>()

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
  isDialogOpen.value = true

  facets.value = await fetchRecipientFacets()
  await refreshRecipients()
}

defineExpose({ open })

async function submit() {
  dialogError.value = ''
  if (!body.value.trim()) {
    dialogError.value = 'Введите текст сообщения'
    return
  }
  if (recipients.value.length === 0) {
    dialogError.value = 'Нет проживающих, подходящих под выбранные фильтры'
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
        <DialogTitle>Написать проживающим</DialogTitle>
      </DialogHeader>

      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <Label>Конкретным людям (ищет по ФИО, можно добавить несколько)</Label>
          <SearchSelect
            v-model="personQuery"
            :items="personSearchResults"
            :item-key="(p: ChatRecipient) => p.individualUid"
            :item-label="(p: ChatRecipient) => p.fullName"
            :item-sub-label="(p: ChatRecipient) => p.room ?? ''"
            placeholder="Например, Иванов"
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
                <span class="sr-only">Убрать {{ p.fullName }}</span>
              </button>
            </span>
          </div>
        </div>

        <p v-if="hasExplicitPicks" class="text-xs text-muted-foreground">
          Выбраны конкретные получатели — фильтры по этажу/корпусу/должникам ниже не участвуют.
        </p>

        <div class="grid grid-cols-2 gap-4" :class="hasExplicitPicks ? 'opacity-50' : ''">
          <div class="flex flex-col gap-2">
            <Label>Этаж</Label>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="outline" class="w-full justify-between font-normal" :disabled="hasExplicitPicks">
                  <span class="truncate">{{ floors.length ? floors.join(', ') : 'Все этажи' }}</span>
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
                <div v-if="!facets?.floors.length" class="px-2 py-1.5 text-sm text-muted-foreground">Нет данных по этажам</div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div class="flex flex-col gap-2">
            <Label>Корпус</Label>
            <Select
              :model-value="corpus || undefined"
              :disabled="hasExplicitPicks || !facets?.corpusAvailable"
              @update:model-value="(v) => (corpus = (v as string) ?? '')"
            >
              <SelectTrigger>
                <SelectValue :placeholder="facets?.corpusAvailable ? 'Все корпуса' : 'Характеристика не заведена'" />
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
            Только должники<span v-if="facets"> ({{ facets.debtorsCount }})</span>
          </Label>
        </div>

        <div class="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          <Users class="size-4 shrink-0" />
          <span v-if="isLoadingRecipients">Подсчёт получателей...</span>
          <span v-else>Получат сообщение: {{ recipients.length }}</span>
        </div>

        <div class="flex flex-col gap-2">
          <Label>Сообщение</Label>
          <textarea
            v-model="body"
            rows="4"
            placeholder="Текст сообщения..."
            class="flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground transition-shadow focus-visible:outline-none focus-visible:border-ring/50 focus-visible:ring-4 focus-visible:ring-ring/20 focus-visible:shadow-sm"
          />
        </div>
      </div>

      <DialogFooter>
        <p v-if="dialogError" class="mr-auto self-center text-sm text-red-500">{{ dialogError }}</p>
        <Button :loading="isSending" :disabled="recipients.length === 0" @click="submit">Отправить</Button>
      </DialogFooter>
    </DialogScrollContent>
  </Dialog>
</template>
