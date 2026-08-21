<script setup lang="ts">
import { roleLabel, roleIcon } from '@/lib/roles-api'
import type { UserRow } from '@/lib/users-api'

defineProps<{ value: unknown; row?: UserRow }>()
</script>

<template>
  <div class="flex flex-wrap gap-1">
    <span
      v-for="r in row?.roles ?? []"
      :key="r.id"
      class="flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground"
    >
      <component :is="roleIcon(r.name)" class="size-3 shrink-0" />
      {{ roleLabel(r.name) }}
    </span>
  </div>
</template>
