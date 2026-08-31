<script setup lang="ts">
import ContractStatusPill from '@/components/ContractStatusPill.vue'
import type { ContractStatus } from '@/lib/contracts-api'

const props = defineProps<{ value: unknown; row?: unknown }>()
</script>

<template>
  <div class="flex justify-center">
    <ContractStatusPill :status="props.value as ContractStatus" />
  </div>
</template>
