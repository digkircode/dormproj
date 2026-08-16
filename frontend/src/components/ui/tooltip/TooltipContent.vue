<script setup lang="ts">
import type { TooltipContentEmits, TooltipContentProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { TooltipContent, TooltipPortal, useForwardPropsEmits } from "reka-ui"
import { cn } from "@/lib/utils"

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(defineProps<TooltipContentProps & { class?: HTMLAttributes["class"] }>(), {
  sideOffset: 4,
})

const emits = defineEmits<TooltipContentEmits>()

const delegatedProps = reactiveOmit(props, "class")

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <TooltipPortal>
    <!-- Без анимаций (ни enter, ни exit) сознательно: Reka показывает/убирает подсказку
         из DOM через Presence-паттерн (см. usePresence в reka-ui), который держит элемент
         в DOM, пока не сработает animationend для текущего animation-name. Поймано вживую —
         если это событие по какой-то причине не срабатывает (а animate-in безусловно
         числился "текущей анимацией" даже после закрытия), подсказка виснет в DOM навсегда
         поверх страницы, в том числе после закрытия диалога. Без animation-name вообще
         Presence видит "анимации нет" и мгновенно домонтирует/удаляет элемент напрямую,
         без зависимости от animationend. -->
    <TooltipContent v-bind="{ ...forwarded, ...$attrs }" :class="cn('z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md', props.class)">
      <slot />
    </TooltipContent>
  </TooltipPortal>
</template>
