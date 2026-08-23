<script setup lang="ts">
import { computed } from 'vue'
import ContractStatusPill from '@/components/ContractStatusPill.vue'
import { getContractDisplayStatus } from '@/lib/contracts-format'
import type { ContractStatus, ContractListItem } from '@/lib/contracts-api'

const props = defineProps<{ value: unknown; row?: unknown }>()

// endDate нужен, чтобы отличить "Действует" от "Истекает" (см. getContractDisplayStatus) —
// row здесь реально ContractListItem, тот же контракт {value, row}, что и у остальных cellRenderers.
const displayStatus = computed(() => {
  const status = props.value as ContractStatus
  const endDate = (props.row as ContractListItem | undefined)?.endDate
  return endDate ? getContractDisplayStatus(status, endDate) : status
})
</script>

<template>
  <div class="flex justify-center">
    <ContractStatusPill :status="displayStatus" />
  </div>
</template>
