<script setup lang="ts" generic="T">
import { ref } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { Input } from '@/components/ui/input'

const props = defineProps<{
  items: T[]
  itemKey: (item: T) => string | number
  itemLabel: (item: T) => string
  placeholder?: string
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

function onInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  query.value = value
  suppressNextOpen.value = false
  isOpen.value = true
  emit('search', value)
}

function onFocus() {
  if (!suppressNextOpen.value && props.items.length) isOpen.value = true
}

function choose(item: T) {
  suppressNextOpen.value = true
  isOpen.value = false
  emit('select', item)
}

onClickOutside(rootRef, () => {
  isOpen.value = false
})
</script>

<template>
  <div ref="rootRef" class="relative">
    <Input :model-value="query" :placeholder="placeholder" autocomplete="off" @input="onInput" @focus="onFocus" />
    <div
      v-if="isOpen && items.length"
      class="absolute top-full z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover shadow-md"
    >
      <button
        v-for="item in items"
        :key="itemKey(item)"
        type="button"
        class="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
        @click="choose(item)"
      >
        {{ itemLabel(item) }}
      </button>
    </div>
  </div>
</template>
