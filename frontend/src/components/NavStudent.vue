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

defineProps<{
  items: {
    title: string
    url: string
    icon?: LucideIcon
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
