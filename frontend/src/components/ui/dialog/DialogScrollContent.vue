<script setup lang="ts">
import type { DialogContentEmits, DialogContentProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { X } from "lucide-vue-next"
import {
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  useForwardPropsEmits,
} from "reka-ui"
import { cn } from "@/lib/utils"

const props = defineProps<DialogContentProps & { class?: HTMLAttributes["class"] }>()
const emits = defineEmits<DialogContentEmits>()

const delegatedProps = reactiveOmit(props, "class")

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <DialogPortal>
    <!-- place-items:safe center, не просто center — обычный center у скроллящегося grid-
         контейнера при переполнении (контент выше вьюпорта, например от мобильной
         клавиатуры при фокусе на инпуте) обрезает доступ к одному из краёв контента даже
         со скроллом — футер с кнопками становится недостижим/визуально пропадает. safe
         center ведёт себя как center, пока контент помещается, и падает до start, когда
         не помещается. -->
    <DialogOverlay
      class="fixed inset-0 z-50 grid will-change-transform [place-items:safe_center] overflow-y-auto bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    >
      <DialogContent
        :class="
          cn(
            // max-h-[70vh] — модалка не выше 70% экрана (отступ ~15% сверху/снизу за счёт
            // place-items:safe_center на оверлее), overflow-y-auto — скролл внутри самой
            // модалки, а не всей страницы/оверлея, как было раньше (см. my-8 в старой версии).
            'relative z-50 grid w-full max-w-lg max-h-[70vh] gap-4 overflow-y-auto border border-border bg-background p-6 shadow-lg duration-200 will-change-transform sm:rounded-lg md:w-full',
            props.class,
          )
        "
        v-bind="forwarded"
        @pointer-down-outside="(event) => {
          const originalEvent = event.detail.originalEvent;
          const target = originalEvent.target as HTMLElement;
          if (originalEvent.offsetX > target.clientWidth || originalEvent.offsetY > target.clientHeight) {
            event.preventDefault();
          }
        }"
      >
        <slot />

        <DialogClose
          class="absolute top-3 right-3 p-0.5 transition-colors rounded-md hover:bg-secondary"
        >
          <X class="w-4 h-4 text-red-500" />
          <span class="sr-only">Close</span>
        </DialogClose>
      </DialogContent>
    </DialogOverlay>
  </DialogPortal>
</template>
