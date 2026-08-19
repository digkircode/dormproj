<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import AppSidebar from './components/AppSidebar.vue'
import AppFooter from './components/AppFooter.vue'
import { currentUser, isAuthLoading, loadCurrentUser } from '@/lib/auth-state'
import { rosnouLoginUrl } from '@/lib/auth-api'
import { breadcrumbOverride, breadcrumbTrail as trackedTrail } from '@/lib/breadcrumb-state'

// Реальный пройденный путь (см. trackBreadcrumbs в router/index.ts), а не статичная
// иерархия роутов — последняя крошка ещё и переопределяется на конкретное значение
// (номер договора, имя физлица), если детальная страница его выставила.
const breadcrumbTrail = computed(() =>
  trackedTrail.value.map((crumb, i) =>
    i === trackedTrail.value.length - 1 && breadcrumbOverride.value ? { ...crumb, title: breadcrumbOverride.value } : crumb,
  ),
)

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
            <template v-for="(crumb, i) in breadcrumbTrail" :key="crumb.name">
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
