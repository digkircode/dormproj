<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter, type RouteRecordNormalized } from 'vue-router'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import AppSidebar from './components/AppSidebar.vue'
import { currentUser, isAuthLoading, loadCurrentUser } from '@/lib/auth-state'
import { rosnouLoginUrl } from '@/lib/auth-api'

const route = useRoute()
const router = useRouter()

// Родитель страницы объявляется через meta.parent (см. router/index.ts) — так путь
// в хлебных крошках всегда показывает всю цепочку, а не только текущую страницу.
const breadcrumbTrail = computed(() => {
  const trail: { title: string; path: string }[] = []
  let current: RouteRecordNormalized | undefined = route.matched[route.matched.length - 1]
  while (current) {
    if (current.meta.title) {
      trail.unshift({ title: current.meta.title as string, path: current.path })
    }
    const parentName = current.meta.parent as string | undefined
    current = parentName ? router.getRoutes().find((r) => r.name === parentName) : undefined
  }
  return trail
})

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
            <template v-for="(crumb, i) in breadcrumbTrail" :key="crumb.path">
              <BreadcrumbItem>
                <BreadcrumbLink v-if="i < breadcrumbTrail.length - 1" as-child>
                  <RouterLink :to="crumb.path">{{ crumb.title }}</RouterLink>
                </BreadcrumbLink>
                <BreadcrumbPage v-else>{{ crumb.title }}</BreadcrumbPage>
              </BreadcrumbItem>
              <BreadcrumbSeparator v-if="i < breadcrumbTrail.length - 1" />
            </template>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <RouterView />
    </SidebarInset>
  </SidebarProvider>
</template>
