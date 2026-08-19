<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter, type RouteRecordNormalized } from 'vue-router'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import AppSidebar from './components/AppSidebar.vue'
import AppFooter from './components/AppFooter.vue'
import { currentUser, isAuthLoading, loadCurrentUser } from '@/lib/auth-state'
import { rosnouLoginUrl } from '@/lib/auth-api'
import { breadcrumbOverride } from '@/lib/breadcrumb-state'

const route = useRoute()
const router = useRouter()

// Родитель страницы объявляется через meta.parent (см. router/index.ts) — так путь
// в хлебных крошках всегда показывает всю цепочку, а не только текущую страницу.
// Последняя крошка (текущая страница) — либо статичный meta.title, либо, если детальная
// страница выставила breadcrumbOverride (номер договора, имя физлица и т.п.), то он —
// иначе крошка показывала бы общее название вида "Информация о договоре" для любой карточки.
const breadcrumbTrail = computed(() => {
  const trail: { title: string; path: string }[] = []
  let current: RouteRecordNormalized | undefined = route.matched[route.matched.length - 1]
  let isLast = true
  while (current) {
    if (current.meta.title) {
      const title = isLast && breadcrumbOverride.value ? breadcrumbOverride.value : (current.meta.title as string)
      trail.unshift({ title, path: current.path })
      isLast = false
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
    <!-- h-svh + overflow-hidden — сама страница (html/body/SidebarInset) никогда не
         скроллится, только явно выделенные блоки внутри неё (см. ниже + Rooms.vue). Раньше
         страницы вроде Rooms.vue подгоняли себя под calc(100vh-Xrem) с угаданной константой
         под высоту хедера — хрупко и разъезжалось при малейшем изменении шапки. Теперь
         высота считается только через flex/min-h-0 от реального SidebarInset, без магических чисел. -->
    <SidebarInset class="h-svh overflow-hidden">
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

      <!-- Единственный уровень, где допустим "обычный" скролл страницы — для страниц,
           которым не нужен собственный внутренний скролл (списки с пагинацией и т.п.), это
           выглядит как раньше. Страницы вроде Rooms.vue сами заполняют это место (h-full)
           и внутри управляют скроллом по блокам — тогда здесь скроллить нечему. -->
      <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <RouterView />
        <AppFooter />
      </div>
    </SidebarInset>
  </SidebarProvider>
</template>
