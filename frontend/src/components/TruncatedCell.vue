<script setup lang="ts">
import { ref } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const props = defineProps<{ text: string }>()

const el = ref<HTMLElement | null>(null)
const isTruncated = ref(false)

// Реагирует и на изменение ширины колонки (ресайз), и на смену текста —
// тултип должен появляться/исчезать по факту, а не быть решённым один раз при монтировании.
useResizeObserver(el, () => {
  if (el.value) {
    isTruncated.value = el.value.scrollWidth > el.value.clientWidth
  }
})
</script>

<template>
  <Tooltip :disabled="!isTruncated">
    <TooltipTrigger as-child>
      <span ref="el" class="block truncate">{{ props.text }}</span>
    </TooltipTrigger>
    <TooltipContent>{{ props.text }}</TooltipContent>
  </Tooltip>
</template>
