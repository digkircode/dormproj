<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { STATUS_LABELS, STATUS_VARIANTS } from '@/lib/contracts-format'
import type { ContractStatus } from '@/lib/contracts-api'

defineProps<{ value: unknown; row?: unknown }>()
</script>

<template>
  <Badge :variant="STATUS_VARIANTS[value as ContractStatus]">{{ STATUS_LABELS[value as ContractStatus] }}</Badge>
</template>
