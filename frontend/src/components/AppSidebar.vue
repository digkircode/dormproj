<script setup lang="ts">
import type { SidebarProps } from '@/components/ui/sidebar'
import {
  LayoutDashboard,
  Repeat,
  BarChart3,
  Users,
  RefreshCw,
} from 'lucide-vue-next'
import NavMain from '@/components/NavMain.vue'
import NavProjects from '@/components/NavProjects.vue'
import NavUser from '@/components/NavUser.vue'
import TeamSwitcher from '@/components/TeamSwitcher.vue'

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

const data = {
  user: {
    name: 'RosNOU',
    email: 'admin@rosnou.ru',
    avatar: '',
  },
  teams: [
    {
      name: 'RosNOU',
      plan: 'Общежитие',
    },
  ],
  navMain: [
    {
      title: 'Dashboard',
      url: '#',
      icon: LayoutDashboard,
      items: [
        { title: 'Обзор', url: '#' },
        { title: 'Отчёты', url: '#' },
      ],
    },
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
  ],
  projects: [
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
      <NavUser :user="data.user" />
    </SidebarFooter>
    <SidebarRail />
  </Sidebar>
</template>
