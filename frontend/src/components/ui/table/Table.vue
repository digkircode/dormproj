<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  class?: HTMLAttributes["class"]
  scrollClass?: HTMLAttributes["class"]
}>()
</script>

<template>
  <div :class="cn('relative min-h-0 min-w-0 w-full flex-1 overflow-auto [scrollbar-gutter:stable]', props.scrollClass)">
    <table v-bind="$attrs" :class="cn('data-reveal w-full caption-bottom text-sm', props.class)">
      <slot />
    </table>
  </div>
</template>
