<script setup lang="ts">
import RoomInfoTrigger from '@/components/RoomInfoTrigger.vue'
import type { ContractListItem } from '@/lib/contracts-api'

const props = defineProps<{ value: unknown; row?: unknown }>()
</script>

<template>
  <RoomInfoTrigger :room-id="(props.row as ContractListItem).roomId" :room-name="props.value as string | null" />
</template>
