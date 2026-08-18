<script setup lang="ts">
import { computed, ref } from 'vue'
import { CalendarIcon } from 'lucide-vue-next'
import { parseDate, type DateValue } from '@internationalized/date'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

defineProps<{ placeholder?: string }>()
// ISO-строка (YYYY-MM-DD), как везде в проекте — не Date, чтобы не тянуть за собой часовые пояса.
const model = defineModel<string>({ required: true })

const isOpen = ref(false)
const calendarValue = computed<DateValue | undefined>(() => (model.value ? parseDate(model.value) : undefined))

function formatDate(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
}

function onSelect(value: DateValue | undefined) {
  if (value) model.value = value.toString()
  isOpen.value = false
}
</script>

<template>
  <Popover :open="isOpen" @update:open="(v) => (isOpen = v)">
    <PopoverTrigger as-child>
      <Button type="button" variant="outline" class="w-full justify-start text-left font-normal">
        <CalendarIcon class="mr-2 size-4 text-primary" />
        {{ model ? formatDate(model) : (placeholder ?? 'Выберите дату') }}
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-auto p-0">
      <Calendar locale="ru" :model-value="calendarValue" @update:model-value="onSelect" />
    </PopoverContent>
  </Popover>
</template>
