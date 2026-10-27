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

useResizeObserver(el, checkTruncated)

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
