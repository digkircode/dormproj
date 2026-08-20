<script setup lang="ts">
import { FileText } from 'lucide-vue-next'

defineProps<{ value: unknown; row?: unknown }>()

// -mx/-my компенсируют паддинг ячейки под hover-подложку — тот же приём, что у
// ФИО в шапке ContractDetail.vue.
const LINK_CLASS =
  '-mx-1.5 -my-0.5 flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-accent-foreground'
</script>

<template>
  <RouterLink :to="{ name: 'contract-detail', params: { id: (row as { contractId: number }).contractId } }" :class="LINK_CLASS">
    <FileText class="size-4 shrink-0 text-primary" />
    <span class="min-w-0 truncate">{{ value }}</span>
  </RouterLink>
</template>
