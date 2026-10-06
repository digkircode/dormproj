<script setup lang="ts">
import { inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { roleLabel, roleIcon } from '@/lib/roles-api'
import { USER_ROLES_CLICK_KEY, type RolesRow } from '@/lib/user-roles-click'

// row — не жёстко UserRow, а любая строка с полем roles (см. UsersList.vue, тот же
// рендерер переиспользован для AllUsersRow — она тоже содержит roles: Role[]).
const props = defineProps<{ value: unknown; row?: RolesRow }>()
const { t } = useI18n()

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
    class="flex min-h-8 w-full flex-wrap items-center gap-1 text-left"
    :class="onClick ? 'min-h-12 cursor-pointer px-4 py-2 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring' : 'px-4 py-2'"
    :aria-label="onClick ? t('users.staff.manageRoles') : undefined"
    @click="onClick && props.row && onClick(props.row)"
  >
    <span v-if="!row?.roles.length" class="text-xs text-muted-foreground">{{ t('users.manageDialog.noRoles') }}</span>
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
