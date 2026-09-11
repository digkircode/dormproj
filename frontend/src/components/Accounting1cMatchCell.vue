<script setup lang="ts">
import Accounting1cLinkedBadge from '@/components/Accounting1cLinkedBadge.vue'

defineProps<{ value: unknown }>()
</script>

<template>
  <Accounting1cLinkedBadge :linked="value === true" />
</template>
