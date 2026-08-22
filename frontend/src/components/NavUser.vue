<script setup lang="ts">
import { computed } from "vue"
import {
  ChevronsUpDown,
  LogOut,
} from "lucide-vue-next"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { rosnouLogoutUrl } from "@/lib/auth-api"

const props = defineProps<{
  user: {
    id?: number
    name: string
    email: string
    avatar: string
  }
}>()

const { isMobile } = useSidebar()

const initials = computed(() =>
  props.user.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase(),
)

// Пасхалка по прямой просьбе пользователя — только для аккаунта id=818, больше нигде.
const isGm = computed(() => props.user.id === 818)

function handleLogout() {
  window.location.href = rosnouLogoutUrl()
}
</script>

<template>
  <SidebarMenu>
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <SidebarMenuButton
            size="lg"
            class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          >
            <Avatar class="h-8 w-8 rounded-lg" :class="{ 'rainbow-avatar': isGm }">
              <AvatarImage :src="user.avatar" :alt="user.name" />
              <AvatarFallback class="rounded-lg" :class="{ 'text-white': isGm }">
                {{ initials }}
              </AvatarFallback>
            </Avatar>
            <div class="grid flex-1 text-left text-sm leading-tight">
              <span class="flex items-center gap-1 truncate font-medium">
                <span class="truncate" :class="{ 'rainbow-text': isGm }">{{ user.name }}</span>
                <span v-if="isGm" class="gm-badge">GM</span>
              </span>
              <span class="truncate text-xs">{{ user.email }}</span>
            </div>
            <ChevronsUpDown class="ml-auto size-4" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          class="w-auto min-w-56 rounded-lg"
          :side="isMobile ? 'bottom' : 'right'"
          align="end"
          :side-offset="4"
        >
          <DropdownMenuLabel class="p-0 font-normal">
            <div class="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
              <Avatar class="h-8 w-8 rounded-lg" :class="{ 'rainbow-avatar': isGm }">
                <AvatarImage :src="user.avatar" :alt="user.name" />
                <AvatarFallback class="rounded-lg">
                  {{ initials }}
                </AvatarFallback>
              </Avatar>
              <div class="grid flex-1 text-left text-sm leading-tight">
                <span class="flex items-center gap-1 truncate font-semibold">
                  <span class="truncate" :class="{ 'rainbow-text': isGm }">{{ user.name }}</span>
                  <span v-if="isGm" class="gm-badge">GM</span>
                </span>
                <span class="truncate text-xs">{{ user.email }}</span>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem @click="handleLogout">
            <LogOut class="text-primary" />
            Выход
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  </SidebarMenu>
</template>

<style scoped>
@keyframes rainbow-shift {
  to {
    background-position: 200% center;
  }
}

.rainbow-text {
  background-image: linear-gradient(90deg, #ff0040, #ff9900, #ffee00, #33ff00, #00e5ff, #3366ff, #cc33ff, #ff0040);
  background-size: 200% auto;
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  animation: rainbow-shift 4s linear infinite;
}

.rainbow-avatar {
  background-image: linear-gradient(90deg, #ff0040, #ff9900, #ffee00, #33ff00, #00e5ff, #3366ff, #cc33ff, #ff0040);
  background-size: 200% auto;
  animation: rainbow-shift 4s linear infinite;
}

.gm-badge {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  padding: 0 5px;
  height: 14px;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  color: white;
  background-image: linear-gradient(90deg, #ff0040, #ff9900, #ffee00, #33ff00, #00e5ff, #3366ff, #cc33ff, #ff0040);
  background-size: 200% auto;
  animation: rainbow-shift 4s linear infinite;
}
</style>
