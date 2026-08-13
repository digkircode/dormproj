<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const props = defineProps<{ text: string }>()

const el = ref<HTMLElement | null>(null)
const isTruncated = ref(false)

function checkTruncated() {
  if (el.value) {
    isTruncated.value = el.value.scrollWidth > el.value.clientWidth
  }
}

// Реагирует и на изменение ширины колонки (ресайз), и на смену текста —
// тултип должен появляться/исчезать по факту, а не быть решённым один раз при монтировании.
useResizeObserver(el, checkTruncated)

// ResizeObserver не срабатывает, если DOM-узел переиспользуется Vue для другой строки
// (например, при позиционном key-переиспользовании после смены фильтра) — размер тот же,
// а текст новый. Пересчитываем отдельно при каждой смене текста.
watch(() => props.text, () => nextTick(checkTruncated))
</script>

<template>
  <Tooltip :disabled="!isTruncated">
    <TooltipTrigger as-child>
      <span ref="el" class="block truncate">{{ props.text }}</span>
    </TooltipTrigger>
    <TooltipContent class="max-w-md whitespace-pre-wrap break-words">{{ props.text }}</TooltipContent>
  </Tooltip>
</template>
