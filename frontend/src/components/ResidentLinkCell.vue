<script setup lang="ts">
import { User } from 'lucide-vue-next'

defineProps<{ value: unknown; row?: unknown }>()

const LINK_CLASS =
  '-mx-1.5 -my-0.5 flex w-fit items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-accent-foreground'
</script>

<template>
  <RouterLink
    :to="{ name: 'individual-detail', params: { uid: (row as { residentIndividualUid: string }).residentIndividualUid } }"
    :class="LINK_CLASS"
  >
    <User class="size-4 shrink-0 text-primary" />
    {{ value }}
  </RouterLink>
</template>
