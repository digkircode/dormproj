<script setup lang="ts">
import { computed } from 'vue'
import type { SidebarProps } from '@/components/ui/sidebar'
import {
  BarChart3,
  Users,
  RefreshCw,
  User,
  Table2,
  DoorOpen,
  FileText,
} from 'lucide-vue-next'
import NavMain from '@/components/NavMain.vue'
import NavProjects from '@/components/NavProjects.vue'
import NavUser from '@/components/NavUser.vue'
import TeamSwitcher from '@/components/TeamSwitcher.vue'
import { currentUser } from '@/lib/auth-state'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'

const props = withDefaults(defineProps<SidebarProps>(), {
  collapsible: 'icon',
})

// AppSidebar рендерится только когда currentUser уже точно есть (см. App.vue) —
// проверка тут просто чтобы TypeScript не ругался на возможный null.
const user = computed(() => ({
  id: currentUser.value?.id,
  name: currentUser.value?.fullName ?? '',
  email: currentUser.value?.email ?? '',
  avatar: '',
}))

// Тот же принцип, что и router-guard (router/index.ts) — Администратор видит обе
// группы, Сотрудник только "Сотрудник" (NavMain), без роли — ни одной (только
// "Главная", которой в сайдбаре нет вовсе).
const roles = computed(() => currentUser.value?.roles ?? [])
const isAdmin = computed(() => roles.value.includes('ADMIN'))
const canSeeStaffSection = computed(() => isAdmin.value || roles.value.includes('STAFF'))
const canSeeAdminSection = computed(() => isAdmin.value)

const data = {
  teams: [
    {
      name: 'RosNOU',
      plan: 'Общежитие',
    },
  ],
  navMain: [
    {
      title: 'Физические лица',
      url: '/individuals',
      icon: User,
    },
    {
      title: 'Комнаты',
      url: '/rooms',
      icon: DoorOpen,
    },
    {
      title: 'Договоры',
      url: '/contracts',
      icon: FileText,
    },
    {
      title: 'Отчёты',
      icon: BarChart3,
      items: [
        { title: 'Занятость общежития', url: '/reports/occupancy' },
        { title: 'Реестр проживающих', url: '/reports/contingent' },
        { title: 'Реестр договоров', url: '/reports/contracts' },
        { title: 'Финансовый отчёт', url: '/reports/debt' },
        { title: 'Движение проживающих', url: '/reports/move-in-out' },
      ],
    },
  ],
  projects: [
    {
      name: 'Системные таблицы',
      icon: Table2,
      items: [
        { title: 'Контингент', url: '/students' },
        { title: 'Гражданство', url: '/system-tables/citizenship' },
        { title: 'Контактная информация', url: '/system-tables/contact-info' },
        { title: 'Паспортные данные', url: '/system-tables/passport-data' },
        { title: 'Характеристики комнат', url: '/room-characteristics' },
      ],
    },
    { name: 'Синхронизация', url: '/sync', icon: RefreshCw },
    {
      name: 'Пользователи',
      icon: Users,
      items: [
        { title: 'Сотрудники', url: '/users' },
        { title: 'Роли', url: '/roles' },
      ],
    },
  ],
}
</script>

<template>
  <Sidebar v-bind="props">
    <SidebarHeader>
      <TeamSwitcher :teams="data.teams" />
    </SidebarHeader>
    <SidebarContent>
      <NavMain v-if="canSeeStaffSection" :items="data.navMain" />
      <NavProjects v-if="canSeeAdminSection" :projects="data.projects" />
    </SidebarContent>
    <SidebarFooter>
      <NavUser :user="user" />
    </SidebarFooter>
    <SidebarRail />
  </Sidebar>
</template>
