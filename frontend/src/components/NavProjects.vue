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
  projects: {
    name: string
    url?: string
    icon?: LucideIcon
    isActive?: boolean
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
function handleGroupClick(name: string, isActive?: boolean) {
  if (state.value === 'collapsed' && !isMobile.value) {
    setOpen(true)
    openGroups[name] = true
    return
  }
  openGroups[name] = !(openGroups[name] ?? isActive ?? false)
}
</script>

<template>
  <SidebarGroup>
    <SidebarGroupLabel>{{ t('sidebar.groupAdmin') }}</SidebarGroupLabel>
    <SidebarMenu>
      <template v-for="item in projects" :key="item.name">
        <Collapsible
          v-if="item.items?.length"
          as-child
          :open="openGroups[item.name] ?? item.isActive ?? false"
          class="group/collapsible"
        >
          <SidebarMenuItem>
            <SidebarMenuButton :tooltip="item.name" @click="handleGroupClick(item.name, item.isActive)">
              <component :is="item.icon" v-if="item.icon" class="text-primary" />
              <span class="truncate">{{ item.name }}</span>
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
          <SidebarMenuButton as-child :tooltip="item.name">
            <RouterLink :to="item.url ?? '#'">
              <component :is="item.icon" v-if="item.icon" class="text-primary" />
              <span>{{ item.name }}</span>
            </RouterLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </template>
    </SidebarMenu>
  </SidebarGroup>
</template>
