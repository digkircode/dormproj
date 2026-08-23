<script setup lang="ts">
import { computed } from "vue"
import type { PrimitiveProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import type { ButtonVariants } from "."
import { Primitive } from "reka-ui"
import { Loader } from "lucide-vue-next"
import { cn } from "@/lib/utils"
import { buttonVariants } from "."

interface Props extends PrimitiveProps {
  variant?: ButtonVariants["variant"]
  size?: ButtonVariants["size"]
  class?: HTMLAttributes["class"]
  disabled?: boolean
  // Единая точка входа под "видно, что что-то грузится" по всему сайту — вместо
  // ручного Transition/свапа иконки на каждой кнопке отдельно (как раньше в
  // IndividualDetail.vue/SyncOverviewActionsCell.vue). Подменяет содержимое на
  // спиннер и автоматически блокирует клик, не полагаясь на то, что вызывающий
  // код не забудет сам передать :disabled.
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  as: "button",
})

const isDisabled = computed(() => props.disabled || props.loading)
</script>

<template>
  <Primitive
    :as="as"
    :as-child="asChild"
    :disabled="isDisabled"
    :class="cn(buttonVariants({ variant, size }), loading && 'relative', props.class)"
  >
    <!-- Спиннер поверх исходного содержимого (не вместо него) — контент остаётся в потоке,
         просто invisible, чтобы кнопка не схлопывалась в квадрат по ширине спиннера. -->
    <span v-if="loading" class="absolute inset-0 flex items-center justify-center">
      <Loader class="animate-spin" />
    </span>
    <span class="contents" :class="{ invisible: loading }">
      <slot />
    </span>
  </Primitive>
</template>
