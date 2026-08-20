<script setup lang="ts">
import { FileText } from 'lucide-vue-next'

// Не ссылка — в отличие от ContractLinkCell.vue, здесь только иконка+текст
// (в реестре проживающих кликабельно только ФИО, см. ResidentLinkCell.vue).
defineProps<{ value: unknown; row?: unknown }>()
</script>

<template>
  <span class="flex items-center gap-1.5">
    <FileText class="size-4 shrink-0 text-muted-foreground" />
    {{ value }}
  </span>
</template>
