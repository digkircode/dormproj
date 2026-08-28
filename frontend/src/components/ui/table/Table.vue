<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

// inheritAttrs:false + v-bind="$attrs" на <table> — по умолчанию Vue кладёt
// незаявленные атрибуты (в частности style) на КОРНЕВОЙ элемент, а это div-обёртка
// под скролл, не сам <table>. EntityTable вешает через :style CSS-переменные ширин
// колонок, которые читает <colgroup>/<col> — а var() у <col>, если пришла не по
// прямой цепочке предков внутри табличной структуры, а через div снаружи, браузер
// резолвит ненадёжно (подтверждено замером: colgroup.getComputedStyle показывал
// верный calc(), но итоговая ширина колонок не менялась после ресайза).
defineOptions({ inheritAttrs: false })

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <!-- md:min-h-0 — см. EntityTable.vue, тот же приём: на десктопе таблица скроллится
       внутри себя (родитель даёт firm-высоту), на мобильном естественно растёт по
       контенту и скроллится вместе со всей страницей. -->
  <div class="relative w-full flex-1 overflow-auto md:min-h-0">
    <table v-bind="$attrs" :class="cn('w-full caption-bottom text-sm', props.class)">
      <slot />
    </table>
  </div>
</template>
