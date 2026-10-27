<script setup lang="ts">
import { FileText } from 'lucide-vue-next'

const props = defineProps<{ value: unknown; row?: unknown }>()

const LINK_CLASS =
  '-mx-1.5 -my-0.5 flex w-fit max-w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-accent-foreground'

const contractId = (props.row as { contractId?: number } | undefined)?.contractId
</script>

<template>
  <RouterLink v-if="contractId != null" :to="{ name: 'contract-detail', params: { id: contractId } }" :class="LINK_CLASS">
    <FileText class="size-4 shrink-0 text-primary" />
    <span class="min-w-0 truncate">{{ value }}</span>
  </RouterLink>
  <span v-else class="min-w-0 truncate text-muted-foreground">{{ value ?? '-' }}</span>
</template>
