<script setup lang="ts">
import { computed, ref } from 'vue'
import { CalendarIcon } from 'lucide-vue-next'
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
import { cn } from '@/lib/utils'

defineProps<{ placeholder?: string }>()
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
  <Popover :open="isOpen" @update:open="(v) => (isOpen = v)">
    <PopoverTrigger as-child>
      <Button type="button" variant="outline" class="w-full justify-start text-left font-normal">
        <CalendarIcon class="mr-2 size-4 text-primary" />
        <span v-if="from && to">{{ formatDate(from) }} – {{ formatDate(to) }}</span>
        <span v-else-if="from">{{ formatDate(from) }} – …</span>
        <span v-else>{{ placeholder ?? 'Выберите период' }}</span>
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
          <RangeCalendarPrev :class="NAV_BUTTON_CLASS" />
          <RangeCalendarHeading class="text-sm font-medium" />
          <RangeCalendarNext :class="NAV_BUTTON_CLASS" />
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
</template>
