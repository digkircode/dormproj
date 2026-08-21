<script setup lang="ts">
import { roleLabel } from '@/lib/roles-api'
import type { UserRow } from '@/lib/users-api'

defineProps<{ value: unknown; row?: UserRow }>()
</script>

<template>
  <div class="flex flex-wrap gap-1">
    <span
      v-for="r in row?.roles ?? []"
      :key="r.id"
      class="rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground"
    >
      {{ roleLabel(r.name) }}
    </span>
  </div>
</template>
