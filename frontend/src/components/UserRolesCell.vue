<script setup lang="ts">
import { inject } from 'vue'
import { roleLabel, roleIcon } from '@/lib/roles-api'
import { USER_ROLES_CLICK_KEY, type RolesRow } from '@/lib/user-roles-click'

// row — не жёстко UserRow, а любая строка с полем roles (см. UsersList.vue, тот же
// рендерер переиспользован для AllUsersRow — она тоже содержит roles: Role[]).
const props = defineProps<{ value: unknown; row?: RolesRow }>()

// Опциональный клик по ячейке — открыть выдачу/отзыв роли (по прямой просьбе 2026-08-31
// для UsersList.vue, где единственный rowAction EntityTable уже занят правкой bind/azure/
// univer id, см. комментарий там). Если родитель не предоставил обработчик (см.
// UsersStaff.vue — там своя кнопка-действие на строку) — ячейка остаётся некликабельной.
const onClick = inject(USER_ROLES_CLICK_KEY, undefined)
</script>

<template>
  <component
    :is="onClick ? 'button' : 'div'"
    type="button"
    class="flex flex-wrap gap-1"
    :class="onClick ? 'cursor-pointer rounded-sm hover:bg-accent' : ''"
    @click="onClick && props.row && onClick(props.row)"
  >
    <span
      v-for="r in row?.roles ?? []"
      :key="r.id"
      class="flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground"
    >
      <component :is="roleIcon(r.name)" class="size-3 shrink-0 text-primary" />
      {{ roleLabel(r.name) }}
    </span>
  </component>
</template>
