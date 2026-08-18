<script setup lang="ts">
import { STATUS_LABELS, STATUS_ICON, STATUS_ICON_CLASS } from '@/lib/contracts-format'
import type { ContractStatus } from '@/lib/contracts-api'

defineProps<{ value: unknown; row?: unknown }>()
</script>

<template>
  <span class="flex items-center gap-2">
    <component :is="STATUS_ICON[value as ContractStatus]" class="size-4" :class="STATUS_ICON_CLASS[value as ContractStatus]" />
    {{ STATUS_LABELS[value as ContractStatus] }}
  </span>
</template>
