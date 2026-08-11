<script setup lang="ts">
import type { LucideIcon } from "lucide-vue-next"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

defineProps<{
  projects: {
    name: string
    url: string
    icon: LucideIcon
  }[]
}>()
</script>

<template>
  <SidebarGroup class="group-data-[collapsible=icon]:hidden">
    <SidebarGroupLabel>Администратор</SidebarGroupLabel>
    <SidebarMenu>
      <SidebarMenuItem v-for="item in projects" :key="item.name">
        <SidebarMenuButton as-child>
          <RouterLink v-if="item.url.startsWith('/')" :to="item.url">
            <component :is="item.icon" />
            <span>{{ item.name }}</span>
          </RouterLink>
          <a v-else :href="item.url">
            <component :is="item.icon" />
            <span>{{ item.name }}</span>
          </a>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  </SidebarGroup>
</template>
