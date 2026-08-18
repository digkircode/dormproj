<script setup lang="ts">
import { computed } from 'vue'
import type { SidebarProps } from '@/components/ui/sidebar'
import {
  Repeat,
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
  name: currentUser.value?.fullName ?? '',
  email: currentUser.value?.email ?? '',
  avatar: '',
}))

const data = {
  teams: [
    {
      name: 'RosNOU',
      plan: 'Общежитие',
    },
  ],
  navMain: [
    {
      title: 'Lifecycle',
      url: '#',
      icon: Repeat,
      items: [
        { title: 'Заселение', url: '#' },
        { title: 'Выселение', url: '#' },
      ],
    },
    {
      title: 'Analytics',
      url: '#',
      icon: BarChart3,
      items: [
        { title: 'Оплаты', url: '#' },
        { title: 'Заселённость', url: '#' },
      ],
    },
    {
      title: 'Team',
      url: '#',
      icon: Users,
      items: [
        { title: 'Сотрудники', url: '#' },
        { title: 'Роли', url: '#' },
      ],
    },
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
      url: '/reports',
      icon: BarChart3,
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
  ],
}
</script>

<template>
  <Sidebar v-bind="props">
    <SidebarHeader>
      <TeamSwitcher :teams="data.teams" />
    </SidebarHeader>
    <SidebarContent>
      <NavMain :items="data.navMain" />
      <NavProjects :projects="data.projects" />
    </SidebarContent>
    <SidebarFooter>
      <NavUser :user="user" />
    </SidebarFooter>
    <SidebarRail />
  </Sidebar>
</template>
