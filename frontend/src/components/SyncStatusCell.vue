<script setup lang="ts">
import { statusLabel } from '@/lib/sync-format'
import SyncStatusPill from '@/components/SyncStatusPill.vue'

defineProps<{ value: unknown; row?: unknown }>()
</script>

<template>
  <div class="flex justify-center">
    <SyncStatusPill :status="statusLabel[value as keyof typeof statusLabel]" />
  </div>
</template>
