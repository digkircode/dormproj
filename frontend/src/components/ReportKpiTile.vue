<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{
  icon: Component
  bgClass: string
  iconClass: string
  label: string
  value: string
  valueClass?: string
}>()
</script>

<template>
  <div class="flex items-center gap-3">
    <div class="flex size-10 shrink-0 items-center justify-center rounded-lg" :class="bgClass">
      <component :is="icon" class="size-5" :class="iconClass" />
    </div>
    <div>
      <p class="text-xs text-muted-foreground">{{ label }}</p>
      <p class="text-lg font-semibold" :class="valueClass">{{ value }}</p>
    </div>
  </div>
</template>
