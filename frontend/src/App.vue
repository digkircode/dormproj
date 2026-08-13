<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import AppSidebar from './components/AppSidebar.vue'
import { currentUser, isAuthLoading, loadCurrentUser } from '@/lib/auth-state'
import { rosnouLoginUrl } from '@/lib/auth-api'

const route = useRoute()

onMounted(async () => {
  await loadCurrentUser()
  if (!currentUser.value) {
    window.location.href = rosnouLoginUrl()
  }
})
</script>

<template>
  <div v-if="isAuthLoading || !currentUser" class="min-h-svh bg-background" />
  <SidebarProvider v-else>
    <AppSidebar />
    <SidebarInset>
      <header class="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" class="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <template v-if="route.name !== 'home'">
              <BreadcrumbItem>
                <BreadcrumbLink as-child>
                  <RouterLink to="/">Главная</RouterLink>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </template>
            <BreadcrumbItem>
              <BreadcrumbPage>{{ route.meta.title }}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <RouterView />
    </SidebarInset>
  </SidebarProvider>
</template>
