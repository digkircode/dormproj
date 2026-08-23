<script setup lang="ts">
import type { AvatarImageProps } from "reka-ui"
import { AvatarImage } from "reka-ui"

const props = defineProps<AvatarImageProps>()
</script>

<template>
  <!-- object-top (не центр) — при круглом/квадратном кропе портретного фото так лицо не
       обрезается сверху (актуально для StudentGeneralInfo.vue; в NavUser.vue аватар
       пока всегда пустой src → падает на AvatarFallback, эта правка там не видна). -->
  <AvatarImage v-bind="props" class="h-full w-full object-cover object-top">
    <slot />
  </AvatarImage>
</template>
