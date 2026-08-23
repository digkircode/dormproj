<script setup lang="ts">
import type { LucideIcon } from "lucide-vue-next"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

// Та же структура, что NavMain.vue/NavProjects.vue, но своя группа "Проживающий"
// (переименована из "Студент" 2026-08-23) — в отличие от них рендерится в AppSidebar
// БЕЗ проверки роли (см. router/index.ts: страницы этой группы без meta.section,
// доступны любому залогиненному, включая пользователей вообще без роли).
defineProps<{
  items: {
    title: string
    url: string
    icon?: LucideIcon
    // Кружок непрочитанного (сейчас только у "Чат с сотрудниками", см.
    // AppSidebar.vue/lib/chat-unread-state.ts).
    badge?: boolean
  }[]
}>()
</script>

<template>
  <SidebarGroup>
    <SidebarGroupLabel>Проживающий</SidebarGroupLabel>
    <SidebarMenu>
      <SidebarMenuItem v-for="item in items" :key="item.title">
        <SidebarMenuButton as-child :tooltip="item.title">
          <RouterLink :to="item.url">
            <component :is="item.icon" v-if="item.icon" class="text-primary" />
            <span>{{ item.title }}</span>
            <span v-if="item.badge" class="ml-auto size-2 shrink-0 rounded-full bg-primary" />
          </RouterLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  </SidebarGroup>
</template>
