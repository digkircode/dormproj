<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { LogIn } from 'lucide-vue-next'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import AppSidebar from './components/AppSidebar.vue'
import AppFooter from './components/AppFooter.vue'
import { currentUser, isAuthLoading, authLoadError, ensureUserLoaded, loadCurrentUser } from '@/lib/auth-state'
import { rosnouLoginUrl } from '@/lib/auth-api'
import { sessionExpired } from '@/lib/api-base'
import { breadcrumbOverride, breadcrumbTrail as trackedTrail } from '@/lib/breadcrumb-state'

const { t } = useI18n()
const route = useRoute()
const isChatRoute = computed(() => route.name === 'student-chat' || route.name === 'chats')

const breadcrumbTrail = computed(() =>
  trackedTrail.value.map((crumb, i) => ({
    ...crumb,
    title: i === trackedTrail.value.length - 1 && breadcrumbOverride.value ? breadcrumbOverride.value : t(crumb.title),
  })),
)

onMounted(async () => {
  await ensureUserLoaded()
  if (!currentUser.value && !authLoadError.value) {
    window.location.href = rosnouLoginUrl()
  }
})

async function retryAuth() {
  await loadCurrentUser()
  if (!currentUser.value && !authLoadError.value) window.location.href = rosnouLoginUrl()
}

function goToLogin() {
  window.location.href = rosnouLoginUrl()
}
</script>

<template>
  <div v-if="isAuthLoading" class="min-h-svh bg-background" />
  <div v-else-if="authLoadError" class="flex min-h-svh items-center justify-center bg-background p-4">
    <div class="flex max-w-sm flex-col items-center gap-4 rounded-lg border bg-card p-6 text-center shadow-sm">
      <p>{{ t('errors.authLoadFailed') }}</p>
      <Button @click="retryAuth">{{ t('errors.retry') }}</Button>
    </div>
  </div>
  <div v-else-if="!currentUser" class="min-h-svh bg-background" />
  <SidebarProvider v-else>
    <AppSidebar />
    <SidebarInset class="h-svh overflow-hidden">
      <header class="h-14 shrink-0 items-center gap-2 border-b bg-card px-4" :class="isChatRoute ? 'hidden md:flex' : 'flex'">
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

      <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]">
        <RouterView />
        <AppFooter />
      </div>
    </SidebarInset>
  </SidebarProvider>

  <div v-if="sessionExpired" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
    <div class="flex max-w-sm flex-col items-center gap-3 rounded-lg border bg-background p-6 text-center shadow-lg">
      <LogIn class="size-8 text-primary" />
      <div>
        <p class="text-sm font-medium">{{ t('session.expiredTitle') }}</p>
        <p class="mt-1 text-sm text-muted-foreground">{{ t('session.expiredDescription') }}</p>
      </div>
      <Button class="mt-1" @click="goToLogin">{{ t('session.expiredAction') }}</Button>
    </div>
  </div>
</template>
