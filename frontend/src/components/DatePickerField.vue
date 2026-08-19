<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CalendarIcon } from 'lucide-vue-next'
import { parseDate, type DateValue } from '@internationalized/date'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { applyDateMask, blockNonDigitKeys, cn } from '@/lib/utils'

// Голый <input>, не обёртка Input.vue — у нашего @input-обработчика (applyDateMask)
// и внутреннего v-model самой Input.vue происходит гонка за то, что реально показать в
// DOM (тот же класс бага, что задокументирован в промпте проекта для type="number":
// два независимых источника правды на одном элементе). Один явный источник — надёжно.
const INPUT_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

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
  const input = event.target as HTMLInputElement
  const masked = applyDateMask(input.value)
  // Пишем в DOM синхронно, а не только через реактивный :value — иначе при быстром
  // вводе/автоповторе клавиши браузер успевает вставить следующий символ раньше, чем
  // долетит реактивный ререндер, и лишние цифры (например в годе) проскакивают мимо маски.
  input.value = masked
  text.value = masked
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
    <input
      :value="text"
      :placeholder="placeholder ?? 'дд.мм.гггг'"
      :class="cn(INPUT_CLASS, 'pr-9', invalid ? 'border-red-500' : '')"
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
