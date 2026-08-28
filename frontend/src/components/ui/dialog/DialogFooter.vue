<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

const props = defineProps<{ class?: HTMLAttributes["class"] }>()
</script>

<template>
  <div
    :class="
      cn(
        // gap-2 безусловный — на мобильном (flex-col-reverse) кнопки без него стояли
        // впритык друг к другу (реальный баг, 2026-08-28); sm:gap-x-2 остаётся для
        // десктопной flex-row раскладки, где раньше и был единственный gap.
        'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-x-2',
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
