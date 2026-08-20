<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ value: unknown }>()

const days = computed(() => Number(props.value ?? 0))
</script>

<template>
  <span :class="days > 0 ? 'text-red-500' : 'text-muted-foreground'">{{ days > 0 ? days : '—' }}</span>
</template>
