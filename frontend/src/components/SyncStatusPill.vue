<script setup lang="ts">
import { statusLabel, syncStatusIcon, syncStatusIconClass, type SyncStatusKey } from '@/lib/sync-format'

const props = defineProps<{ status: SyncStatusKey }>()
</script>

<template>
  <span class="inline-flex w-fit items-center gap-1 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-normal text-muted-foreground">
    <component
      v-if="syncStatusIcon(props.status)"
      :is="syncStatusIcon(props.status)"
      class="size-3.5"
      :class="syncStatusIconClass(props.status)"
    />
    {{ statusLabel[props.status] }}
  </span>
</template>
