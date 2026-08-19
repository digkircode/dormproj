<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { parseDate, type DateValue } from '@internationalized/date'
import {
  RangeCalendarCell,
  RangeCalendarCellTrigger,
  RangeCalendarGrid,
  RangeCalendarGridBody,
  RangeCalendarGridHead,
  RangeCalendarGridRow,
  RangeCalendarHeadCell,
  RangeCalendarHeader,
  RangeCalendarHeading,
  RangeCalendarNext,
  RangeCalendarPrev,
  RangeCalendarRoot,
} from 'reka-ui'
import { Button, buttonVariants } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { applyDateMask, blockNonDigitKeys, cn } from '@/lib/utils'

// Голый <input>, не обёртка Input.vue — см. подробное объяснение в DatePickerField.vue
// (гонка между внутренним v-model обёртки и внешним @input-обработчиком маски).
const INPUT_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground transition-shadow focus-visible:outline-none focus-visible:border-ring/50 focus-visible:ring-4 focus-visible:ring-ring/20 focus-visible:shadow-sm disabled:cursor-not-allowed disabled:opacity-50'

defineProps<{ placeholder?: string; invalid?: boolean }>()
// Два ISO-поля (YYYY-MM-DD), как везде в проекте, а не Date/DateRange — компонент
// снаружи выглядит как два обычных v-model-поля, только UI один period-пикер.
const from = defineModel<string>('from', { default: '' })
const to = defineModel<string>('to', { default: '' })

const isOpen = ref(false)

const rangeValue = computed(() => ({
  start: from.value ? parseDate(from.value) : undefined,
  end: to.value ? parseDate(to.value) : undefined,
}))

function formatDate(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
}

const DATE_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/

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

// Текст полей — своё состояние, не завязано напрямую на from/to (та же причина, что
// в DatePickerField.vue — не мешать печатать промежуточные значения).
const fromText = ref(from.value ? formatDate(from.value) : '')
const toText = ref(to.value ? formatDate(to.value) : '')
watch(from, (value) => {
  fromText.value = value ? formatDate(value) : ''
})
watch(to, (value) => {
  toText.value = value ? formatDate(value) : ''
})

// Пишем в DOM синхронно, а не только через реактивный :value — иначе при быстром
// вводе/автоповторе клавиши браузер успевает вставить следующий символ раньше, чем
// долетит реактивный ререндер, и лишние цифры (например в годе) проскакивают мимо маски
// (см. подробности в DatePickerField.vue).
function onFromInput(event: Event) {
  const input = event.target as HTMLInputElement
  const masked = applyDateMask(input.value)
  input.value = masked
  fromText.value = masked
}
function onToInput(event: Event) {
  const input = event.target as HTMLInputElement
  const masked = applyDateMask(input.value)
  input.value = masked
  toText.value = masked
}

function commitFrom() {
  if (!fromText.value.trim()) {
    from.value = ''
    return
  }
  const iso = parseManual(fromText.value)
  if (iso) {
    from.value = iso
  } else {
    fromText.value = from.value ? formatDate(from.value) : ''
  }
}
function commitTo() {
  if (!toText.value.trim()) {
    to.value = ''
    return
  }
  const iso = parseManual(toText.value)
  if (iso) {
    to.value = iso
  } else {
    toText.value = to.value ? formatDate(to.value) : ''
  }
}

function onRangeUpdate(value: { start?: DateValue; end?: DateValue }) {
  from.value = value.start ? value.start.toString() : ''
  to.value = value.end ? value.end.toString() : ''
  // Обе границы выбраны — закрываем поповер сами, отдельной кнопки "Готово" нет.
  if (value.start && value.end) isOpen.value = false
}

const NAV_BUTTON_CLASS = cn(buttonVariants({ variant: 'outline' }), 'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100')
const CELL_TRIGGER_CLASS = cn(
  buttonVariants({ variant: 'ghost' }),
  'h-9 w-9 p-0 font-normal',
  '[&[data-today]:not([data-selected])]:bg-primary/15 [&[data-today]:not([data-selected])]:text-primary [&[data-today]:not([data-selected])]:font-semibold',
  'data-[selection-start]:bg-primary data-[selection-start]:text-primary-foreground data-[selection-start]:hover:bg-primary data-[selection-start]:hover:text-primary-foreground data-[selection-start]:focus:bg-primary data-[selection-start]:focus:text-primary-foreground',
  'data-[selection-end]:bg-primary data-[selection-end]:text-primary-foreground data-[selection-end]:hover:bg-primary data-[selection-end]:hover:text-primary-foreground data-[selection-end]:focus:bg-primary data-[selection-end]:focus:text-primary-foreground',
  'data-[disabled]:text-muted-foreground data-[disabled]:opacity-50',
  'data-[unavailable]:text-destructive-foreground data-[unavailable]:line-through',
  'data-[outside-view]:text-muted-foreground data-[outside-view]:opacity-50',
)
</script>

<template>
  <!-- Ровно два столбца, как и у полей "Сумма"/"Отсрочка оплаты" под этим полем в
       Contracts.vue — без отдельной колонки под кнопку календаря (иконка наложена
       абсолютно внутри правого поля, тем же приёмом, что в DatePickerField.vue), иначе
       разбивка "от – до [📅]" не совпадает по ширине с 50/50 сеткой снизу. Тире между
       полями — тоже абсолютно спозиционировано поверх зазора, а не отдельная колонка,
       чтобы не портить это выравнивание; чуть увеличенный gap (5 вместо 4) освобождает
       ему место, не наезжая на текст в полях. -->
  <div class="relative grid grid-cols-2 gap-5">
    <input
      :value="fromText"
      placeholder="дд.мм.гггг"
      :class="cn(INPUT_CLASS, invalid ? 'border-red-500' : '')"
      @input="onFromInput"
      @blur="commitFrom"
      @keydown.enter="commitFrom"
      @keydown="blockNonDigitKeys"
    />
    <span class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-muted-foreground">–</span>
    <div class="relative flex items-center">
      <input
        :value="toText"
        placeholder="дд.мм.гггг"
        :class="cn(INPUT_CLASS, 'pr-9', invalid ? 'border-red-500' : '')"
        @input="onToInput"
        @blur="commitTo"
        @keydown.enter="commitTo"
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
        <RangeCalendarRoot
          v-slot="{ grid, weekDays }"
          class="p-3"
          locale="ru"
          :model-value="rangeValue"
          @update:model-value="onRangeUpdate"
        >
          <RangeCalendarHeader class="relative flex w-full items-center justify-between pt-1">
            <RangeCalendarPrev :class="NAV_BUTTON_CLASS">
              <ChevronLeft class="size-4" />
            </RangeCalendarPrev>
            <RangeCalendarHeading class="text-sm font-medium" />
            <RangeCalendarNext :class="NAV_BUTTON_CLASS">
              <ChevronRight class="size-4" />
            </RangeCalendarNext>
          </RangeCalendarHeader>
          <div class="mt-4 flex flex-col gap-y-4 sm:flex-row sm:gap-x-4 sm:gap-y-0">
            <RangeCalendarGrid v-for="month in grid" :key="month.value.toString()" class="w-full border-collapse space-y-1">
              <RangeCalendarGridHead>
                <RangeCalendarGridRow class="flex">
                  <RangeCalendarHeadCell
                    v-for="day in weekDays"
                    :key="day"
                    class="w-9 rounded-md text-[0.8rem] font-normal text-muted-foreground"
                  >
                    {{ day }}
                  </RangeCalendarHeadCell>
                </RangeCalendarGridRow>
              </RangeCalendarGridHead>
              <RangeCalendarGridBody>
                <RangeCalendarGridRow v-for="(weekDates, index) in month.rows" :key="`weekDate-${index}`" class="mt-2 flex w-full">
                  <RangeCalendarCell
                    v-for="weekDate in weekDates"
                    :key="weekDate.toString()"
                    :date="weekDate"
                    class="relative h-9 w-9 p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([data-selected])]:bg-accent [&:has([data-highlighted])]:bg-accent first:[&:has([data-highlighted])]:rounded-l-md last:[&:has([data-highlighted])]:rounded-r-md"
                  >
                    <RangeCalendarCellTrigger :day="weekDate" :month="month.value" :class="CELL_TRIGGER_CLASS" />
                  </RangeCalendarCell>
                </RangeCalendarGridRow>
              </RangeCalendarGridBody>
            </RangeCalendarGrid>
          </div>
        </RangeCalendarRoot>
      </PopoverContent>
      </Popover>
    </div>
  </div>
</template>
