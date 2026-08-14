<script setup lang="ts">
import { statusLabel, statusIcon, statusIconClass } from '@/lib/sync-format'

defineProps<{ value: unknown; row?: unknown }>()
</script>

<template>
  <span class="flex items-center gap-2">
    <component
      :is="statusIcon[statusLabel[value as keyof typeof statusLabel]]"
      class="size-4"
      :class="statusIconClass[statusLabel[value as keyof typeof statusLabel]]"
    />
    {{ statusLabel[value as keyof typeof statusLabel] }}
  </span>
</template>
