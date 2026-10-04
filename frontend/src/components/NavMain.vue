<script setup lang="ts">
import type { LucideIcon } from "lucide-vue-next"
import { reactive } from "vue"
import { useI18n } from "vue-i18n"
import { ChevronRight } from "lucide-vue-next"
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar"

defineProps<{
  items: {
    title: string
    url?: string
    icon?: LucideIcon
    isActive?: boolean
    // Кружок непрочитанного (сейчас только у "Чаты", см. AppSidebar.vue/lib/chat-unread-state.ts).
    badge?: boolean
    items?: {
      title: string
      url: string
    }[]
  }[]
}>()

const { t } = useI18n()
const { state, isMobile, setOpen } = useSidebar()
const openGroups = reactive<Record<string, boolean>>({})

// Свёрнутый (иконочный) сайдбар прячет CollapsibleContent целиком — тоггл открытости
// группы там визуально ничего не даёт, выглядит как "кнопка не работает". В этом
// состоянии клик по группе должен разворачивать сам сайдбар, а не открывать группу.
function handleGroupClick(title: string, isActive?: boolean) {
  if (state.value === 'collapsed' && !isMobile.value) {
    setOpen(true)
    openGroups[title] = true
    return
  }
  openGroups[title] = !(openGroups[title] ?? isActive ?? false)
}
</script>

<template>
  <SidebarGroup>
    <SidebarGroupLabel>{{ t('sidebar.groupStaff') }}</SidebarGroupLabel>
    <SidebarMenu>
      <template v-for="item in items" :key="item.title">
        <Collapsible
          v-if="item.items?.length"
          as-child
          :open="openGroups[item.title] ?? item.isActive ?? false"
          class="group/collapsible"
        >
          <SidebarMenuItem>
            <SidebarMenuButton :tooltip="item.title" @click="handleGroupClick(item.title, item.isActive)">
              <component :is="item.icon" v-if="item.icon" class="text-primary" />
              <span class="truncate">{{ item.title }}</span>
              <ChevronRight class="ml-auto shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
            </SidebarMenuButton>
            <CollapsibleContent>
              <SidebarMenuSub>
                <SidebarMenuSubItem v-for="subItem in item.items" :key="subItem.title">
                  <SidebarMenuSubButton as-child>
                    <RouterLink :to="subItem.url">
                      <span>{{ subItem.title }}</span>
                    </RouterLink>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              </SidebarMenuSub>
            </CollapsibleContent>
          </SidebarMenuItem>
        </Collapsible>
        <SidebarMenuItem v-else>
          <SidebarMenuButton as-child :tooltip="item.title">
            <RouterLink :to="item.url ?? '#'">
              <!-- Кружок непрочитанного дублирован намеренно — см. подробный комментарий
                   в NavStudent.vue: в свёрнутом (icon-only) сайдбаре "ml-auto"-вариант
                   физически рендерился, но обрезался overflow-hidden сжавшейся кнопки —
                   невидимый кружок (реальный баг, "точечки не появляются"). Второй кружок
                   висит на самой иконке, виден только в свёрнутом состоянии. -->
              <span class="relative inline-flex shrink-0">
                <component :is="item.icon" v-if="item.icon" class="size-4 shrink-0 text-primary" />
                <span v-if="item.badge" class="absolute -top-0.5 -right-0.5 hidden size-2 rounded-full bg-primary group-data-[collapsible=icon]:block" />
              </span>
              <span class="truncate">{{ item.title }}</span>
              <span v-if="item.badge" class="ml-auto size-2 shrink-0 rounded-full bg-primary group-data-[collapsible=icon]:hidden" />
            </RouterLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </template>
    </SidebarMenu>
  </SidebarGroup>
</template>
