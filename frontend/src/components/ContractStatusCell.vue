<script setup lang="ts">
import ContractStatusPill from '@/components/ContractStatusPill.vue'
import type { ContractStatus } from '@/lib/contracts-api'

defineProps<{ value: unknown; row?: unknown }>()
</script>

<template>
  <ContractStatusPill :status="value as ContractStatus" />
</template>
