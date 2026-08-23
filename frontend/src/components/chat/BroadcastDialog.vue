<script setup lang="ts">
import { ref, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { Users } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
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

const floor = ref<string>('')
const corpus = ref<string>('')
const debtorsOnly = ref(false)
const search = ref('')
const body = ref('')

async function refreshRecipients() {
  isLoadingRecipients.value = true
  try {
    recipients.value = await fetchRecipients({
      floor: floor.value || undefined,
      corpus: corpus.value || undefined,
      debtorsOnly: debtorsOnly.value || undefined,
      search: search.value.trim() || undefined,
    })
  } catch {
    recipients.value = []
  } finally {
    isLoadingRecipients.value = false
  }
}

const debouncedRefresh = useDebounceFn(refreshRecipients, 300)

watch([floor, corpus, debtorsOnly], refreshRecipients)
watch(search, debouncedRefresh)

async function open() {
  dialogError.value = ''
  floor.value = ''
  corpus.value = ''
  debtorsOnly.value = false
  search.value = ''
  body.value = ''
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
    await sendBroadcast(body.value.trim(), {
      floor: floor.value || undefined,
      corpus: corpus.value || undefined,
      debtorsOnly: debtorsOnly.value || undefined,
      search: search.value.trim() || undefined,
    })
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
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-2">
            <Label>Этаж</Label>
            <Select :model-value="floor || undefined" @update:model-value="(v) => (floor = (v as string) ?? '')">
              <SelectTrigger>
                <SelectValue placeholder="Все этажи" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="value in facets?.floors ?? []" :key="value" :value="value">{{ value }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="flex flex-col gap-2">
            <Label>Корпус</Label>
            <Select
              :model-value="corpus || undefined"
              :disabled="!facets?.corpusAvailable"
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

        <div class="flex cursor-pointer items-center gap-2 rounded-md p-1" @click="debtorsOnly = !debtorsOnly">
          <Checkbox :model-value="debtorsOnly" />
          <Label class="cursor-pointer font-normal">
            Только должники<span v-if="facets"> ({{ facets.debtorsCount }})</span>
          </Label>
        </div>

        <div class="flex flex-col gap-2">
          <Label>Поиск по ФИО (чтобы написать одному конкретному проживающему)</Label>
          <Input v-model="search" placeholder="Например, Иванов" />
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
