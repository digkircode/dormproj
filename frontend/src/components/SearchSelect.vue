<script setup lang="ts" generic="T">
import { ref } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { Input } from '@/components/ui/input'

const props = defineProps<{
  items: T[]
  itemKey: (item: T) => string | number
  itemLabel: (item: T) => string
  // Необязательная вторая строка справа в пункте списка (например дата рождения у ФИО).
  itemSubLabel?: (item: T) => string
  placeholder?: string
  invalid?: boolean
  // Пока идёт запрос (например debounce у серверного поиска) — не показываем
  // "Ничего не найдено" по ещё не готовым items, иначе оно мелькает на каждый символ.
  loading?: boolean
}>()
const emit = defineEmits<{ search: [query: string]; select: [item: T] }>()
// Текст в поле — обычный v-model, значение выбирается через @select, а не выводится
// из query, чтобы после выбора можно было вписать в инпут ровно label выбранного пункта.
const query = defineModel<string>({ required: true })

const rootRef = ref<HTMLElement | null>(null)
const isOpen = ref(false)
// После выбора pickIndividual/pickRoom программно меняет query на label выбранного —
// это тоже триггерит @input, и без флага список тут же выскакивал бы again с тем же
// результатом (баг: выбор применялся, но дропдаун сразу открывался заново).
const suppressNextOpen = ref(false)
// Печать сбрасывает "выбранность" сразу, choose() её ставит — на blur без выбора
// (ушли с поля, ничего не выбрав из списка) текст сбрасываем, чтобы в инпуте не
// оставалось значение, которое выглядит как выбор, но им не является.
const hasSelection = ref(false)

function onInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  query.value = value
  suppressNextOpen.value = false
  hasSelection.value = false
  isOpen.value = true
  emit('search', value)
}

function onFocus() {
  if (!suppressNextOpen.value && props.items.length) isOpen.value = true
}

function choose(item: T) {
  suppressNextOpen.value = true
  hasSelection.value = true
  isOpen.value = false
  emit('select', item)
}

function onBlur() {
  // Клик по пункту списка сначала вызывает mousedown/blur и только потом click —
  // choose() успевает отработать синхронно раньше таймаута и выставить hasSelection.
  setTimeout(() => {
    if (!hasSelection.value) query.value = ''
  }, 150)
}

onClickOutside(rootRef, () => {
  isOpen.value = false
})
</script>

<template>
  <div ref="rootRef" class="relative">
    <Input
      :model-value="query"
      :placeholder="placeholder"
      autocomplete="off"
      :class="invalid ? 'border-red-500' : ''"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
    />
    <div
      v-if="isOpen && !loading && (items.length || query.trim())"
      class="absolute top-full z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover shadow-md"
    >
      <button
        v-for="item in items"
        :key="itemKey(item)"
        type="button"
        class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
        @click="choose(item)"
      >
        <span class="truncate">{{ itemLabel(item) }}</span>
        <span v-if="itemSubLabel" class="shrink-0 text-xs text-muted-foreground">{{ itemSubLabel(item) }}</span>
      </button>
      <p v-if="!items.length" class="px-3 py-2 text-sm text-muted-foreground">Ничего не найдено</p>
    </div>
  </div>
</template>
