<script setup lang="ts">
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

defineProps<{
  teams: {
    name: string
    plan: string
  }[]
}>()
</script>

<template>
  <SidebarMenu>
    <SidebarMenuItem>
      <SidebarMenuButton as="div" size="lg" class="cursor-default hover:bg-transparent active:bg-transparent">
        <div class="flex aspect-square size-8 shrink-0 items-center justify-center">
          <svg width="26" height="26" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M11.4862 28.1964H16.2772H24.4827C25.8043 28.1964 27.082 28.0088 28.2935 27.6668C34.4503 25.9349 38.911 20.0993 38.5365 13.3149C38.129 5.80254 31.7629 0 24.2514 0H1.44141V8.06398V8.97959L8.09385 17.5951H20.5176L13.8652 8.97959H24.3835C26.9388 8.97959 29.1746 10.8108 29.5491 13.337C30.0007 16.492 27.5666 19.2168 24.4937 19.2168H21.7732H9.34944H1.44141V22.9233V28.1964V40H11.4862V28.1964Z" fill="#2699D4" />
            <path d="M37.8206 40L29.9566 29.818H17.5328L25.3968 40H37.8206Z" fill="#2699D4" />
          </svg>
        </div>
        <div class="grid flex-1 text-left text-sm leading-tight">
          <span class="truncate font-medium">
            {{ teams[0]?.name }}
          </span>
          <span class="truncate text-xs">{{ teams[0]?.plan }}</span>
        </div>
      </SidebarMenuButton>
    </SidebarMenuItem>
  </SidebarMenu>
</template>
