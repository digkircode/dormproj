<script setup lang="ts">
import { STATUS_LABELS, STATUS_ICON, STATUS_ICON_CLASS, STATUS_PILL_CLASS, type ContractDisplayStatus } from '@/lib/contracts-format'

defineProps<{ status: ContractDisplayStatus }>()
</script>

<template>
  <span
    class="inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-normal"
    :class="STATUS_PILL_CLASS[status]"
  >
    <component :is="STATUS_ICON[status]" class="size-3.5" :class="STATUS_ICON_CLASS[status]" />
    {{ STATUS_LABELS[status] }}
  </span>
</template>
