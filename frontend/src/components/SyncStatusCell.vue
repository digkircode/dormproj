<script setup lang="ts">
import type { SyncStatusKey } from '@/lib/sync-format'
import SyncStatusPill from '@/components/SyncStatusPill.vue'

defineProps<{ value: unknown; row?: unknown }>()
</script>

<template>
  <div class="flex justify-center">
    <SyncStatusPill :status="value as SyncStatusKey" />
  </div>
</template>
