<script setup lang="ts">
import type { LucideIcon } from "lucide-vue-next"
import { reactive } from "vue"
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
    items?: {
      title: string
      url: string
    }[]
  }[]
}>()

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
    <SidebarGroupLabel>Сотрудник</SidebarGroupLabel>
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
              <component :is="item.icon" v-if="item.icon" class="text-primary" />
              <span>{{ item.title }}</span>
            </RouterLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </template>
    </SidebarMenu>
  </SidebarGroup>
</template>
