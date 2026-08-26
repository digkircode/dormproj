<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import AppSidebar from './components/AppSidebar.vue'
import AppFooter from './components/AppFooter.vue'
import { currentUser, isAuthLoading, ensureUserLoaded } from '@/lib/auth-state'
import { rosnouLoginUrl } from '@/lib/auth-api'
import { breadcrumbOverride, breadcrumbTrail as trackedTrail } from '@/lib/breadcrumb-state'

const { t } = useI18n()

// Реальный пройденный путь (см. trackBreadcrumbs в router/index.ts), а не статичная
// иерархия роутов — последняя крошка ещё и переопределяется на конкретное значение
// (номер договора, имя физлица), если детальная страница его выставила. crumb.title —
// ключ i18n (см. breadcrumb-state.ts), переводится здесь через t() — реактивно
// к текущей локали, override же уже готовый текст, через t() не проводим.
const breadcrumbTrail = computed(() =>
  trackedTrail.value.map((crumb, i) => ({
    ...crumb,
    title: i === trackedTrail.value.length - 1 && breadcrumbOverride.value ? breadcrumbOverride.value : t(crumb.title),
  })),
)

onMounted(async () => {
  await ensureUserLoaded()
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
      <!-- bg-card — по прямой просьбе "сайдбар как хедер": card и есть тот оттенок,
           что теперь взял себе сайдбар (см. style.css), header явным классом фиксирует
           тот же оттенок за собой (раньше держался на унаследованном bg-background,
           который теперь стал другим — фоном страницы). -->
      <header class="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-4">
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
