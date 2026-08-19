<script setup lang="ts">
import { statusIcon, statusIconClass } from '@/lib/sync-format'

defineProps<{ status: string }>()
</script>

<template>
  <span class="inline-flex w-fit items-center gap-1 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-normal text-muted-foreground">
    <component
      v-if="statusIcon[status as keyof typeof statusIcon]"
      :is="statusIcon[status as keyof typeof statusIcon]"
      class="size-3.5"
      :class="statusIconClass[status]"
    />
    {{ status }}
  </span>
</template>
