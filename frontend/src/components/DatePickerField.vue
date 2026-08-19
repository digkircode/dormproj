<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CalendarIcon } from 'lucide-vue-next'
import { parseDate, type DateValue } from '@internationalized/date'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { applyDateMask, blockNonDigitKeys } from '@/lib/utils'

defineProps<{ placeholder?: string; invalid?: boolean }>()
// ISO-строка (YYYY-MM-DD), как везде в проекте — не Date, чтобы не тянуть за собой часовые пояса.
const model = defineModel<string>({ required: true })

const isOpen = ref(false)
const calendarValue = computed<DateValue | undefined>(() => (model.value ? parseDate(model.value) : undefined))

function formatDate(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
}

const DATE_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/

// Парсим строго дд.мм.гггг и перепроверяем, что компоненты даты не "переполнились"
// (Date сам нормализует 31.02 в 03.03 — без обратной сверки невалидная дата тихо
// проехала бы как валидная).
function parseManual(text: string): string | null {
  const match = text.trim().match(DATE_RE)
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${year}-${pad(month)}-${pad(day)}`
}

// Текст поля — собственное состояние, не завязано напрямую на model: иначе на
// каждый введённый символ невалидного промежуточного значения ("31.0") поле
// откатывалось бы или мешало печатать дальше.
const text = ref(model.value ? formatDate(model.value) : '')
watch(model, (value) => {
  text.value = value ? formatDate(value) : ''
})

function onTextInput(event: Event) {
  text.value = applyDateMask((event.target as HTMLInputElement).value)
}

function commitText() {
  if (!text.value.trim()) {
    model.value = ''
    return
  }
  const iso = parseManual(text.value)
  if (iso) {
    model.value = iso
  } else {
    // Невалидный ввод — откатываем текст к последнему валидному значению модели.
    text.value = model.value ? formatDate(model.value) : ''
  }
}

function onSelect(value: DateValue | undefined) {
  if (value) model.value = value.toString()
  isOpen.value = false
}
</script>

<template>
  <div class="relative flex items-center">
    <Input
      :model-value="text"
      :placeholder="placeholder ?? 'дд.мм.гггг'"
      :class="['pr-9', invalid ? 'border-red-500' : '']"
      @input="onTextInput"
      @blur="commitText"
      @keydown.enter="commitText"
      @keydown="blockNonDigitKeys"
    />
    <Popover :open="isOpen" @update:open="(v) => (isOpen = v)">
      <PopoverTrigger as-child>
        <Button type="button" variant="ghost" size="icon" class="absolute right-0 size-10 shrink-0 hover:bg-transparent">
          <CalendarIcon class="size-4" :class="invalid ? 'text-red-500' : 'text-primary'" />
          <span class="sr-only">Открыть календарь</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent class="w-auto p-0">
        <Calendar locale="ru" :model-value="calendarValue" @update:model-value="onSelect" />
      </PopoverContent>
    </Popover>
  </div>
</template>
