<script setup lang="ts">
import type { LucideIcon } from "lucide-vue-next"
import { useI18n } from "vue-i18n"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const { t } = useI18n()

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
    <SidebarGroupLabel>{{ t('sidebar.groupResident') }}</SidebarGroupLabel>
    <SidebarMenu>
      <SidebarMenuItem v-for="item in items" :key="item.title">
        <SidebarMenuButton as-child :tooltip="item.title">
          <RouterLink :to="item.url">
            <!-- Кружок непрочитанного дублирован в двух местах намеренно (не один
                 v-if/v-else) — раньше был только "ml-auto" вариант, который в свёрнутом
                 (icon-only) сайдбаре оказывался вытолкнут за пределы видимой области
                 самим же текстовым span'ом (тот пытается занять полную ширину, но кнопка
                 в свёрнутом виде сжимается до !size-8 с overflow-hidden, см.
                 sidebarMenuButtonVariants) — кружок физически рендерился, но был обрезан
                 и невидим (реальный баг, пойманный на "точечки не появляются"). Второй
                 кружок — поверх самой иконки (relative-обёртка вокруг неё), виден именно
                 в свёрнутом состоянии, где иконка остаётся единственным видимым элементом. -->
            <span class="relative inline-flex shrink-0">
              <component :is="item.icon" v-if="item.icon" class="size-4 shrink-0 text-primary" />
              <span v-if="item.badge" class="absolute -top-0.5 -right-0.5 hidden size-2 rounded-full bg-primary group-data-[collapsible=icon]:block" />
            </span>
            <span class="truncate">{{ item.title }}</span>
            <span v-if="item.badge" class="ml-auto size-2 shrink-0 rounded-full bg-primary group-data-[collapsible=icon]:hidden" />
          </RouterLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  </SidebarGroup>
</template>
