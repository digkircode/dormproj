<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SidebarProps } from '@/components/ui/sidebar'
import {
  BarChart3,
  Users,
  RefreshCw,
  User,
  Table2,
  DoorOpen,
  FileText,
  History,
  Info,
  MessageCircle,
  FileSignature,
  Banknote,
} from 'lucide-vue-next'
import NavStudent from '@/components/NavStudent.vue'
import NavMain from '@/components/NavMain.vue'
import NavProjects from '@/components/NavProjects.vue'
import NavUser from '@/components/NavUser.vue'
import TeamSwitcher from '@/components/TeamSwitcher.vue'
import { currentUser } from '@/lib/auth-state'
import { useChatStream } from '@/lib/chat-stream'
import { fetchConversations, fetchMyChatUnread } from '@/lib/chat-api'
import { hasUnreadStaffChats, hasUnreadResidentChat, residentUnreadCount } from '@/lib/chat-unread-state'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'

const { t } = useI18n()
const { isMobile, setOpenMobile } = useSidebar()

const props = withDefaults(defineProps<SidebarProps>(), {
  collapsible: 'icon',
})

const user = computed(() => ({
  id: currentUser.value?.id,
  name: currentUser.value?.fullName ?? '',
  email: currentUser.value?.email ?? '',
  avatar: '',
}))

const roles = computed(() => currentUser.value?.roles ?? [])
const isAdmin = computed(() => roles.value.includes('ADMIN'))
const canSeeStaffSection = computed(() => isAdmin.value || roles.value.includes('STAFF'))
const canSeeAdminSection = computed(() => isAdmin.value)
const canSeeResidentChat = computed(() => isAdmin.value || roles.value.includes('RESIDENT'))
const hasResidentRole = computed(() => roles.value.includes('RESIDENT'))

const navStudent = computed(() => [
  {
    title: t('nav.studentGeneralInfo'),
    url: '/student/general-info',
    icon: Info,
  },
  ...(canSeeResidentChat.value
    ? [
        { title: t('nav.studentContract'), url: '/student/contract', icon: FileSignature },
        { title: t('nav.studentChat'), url: '/student/chat', icon: MessageCircle, badge: hasUnreadResidentChat.value },
      ]
    : []),
])

async function refreshStaffUnread() {
  try {
    hasUnreadStaffChats.value = (await fetchConversations()).some((c) => c.unread)
  } catch {
  }
}
async function refreshResidentUnread() {
  try {
    const { unread, count } = await fetchMyChatUnread()
    hasUnreadResidentChat.value = unread
    residentUnreadCount.value = count
  } catch {
  }
}

watch(canSeeStaffSection, (value) => value && refreshStaffUnread(), { immediate: true })
watch(hasResidentRole, (value) => value && refreshResidentUnread(), { immediate: true })

useChatStream('/chats/stream', refreshStaffUnread, canSeeStaffSection)
useChatStream('/my-chat/stream', refreshResidentUnread, hasResidentRole)

const navMain = computed(() => [
  {
    title: t('nav.contracts'),
    url: '/contracts',
    icon: FileText,
  },
  {
    title: t('nav.individuals'),
    url: '/individuals',
    icon: User,
  },
  {
    title: t('nav.chats'),
    url: '/chats',
    icon: MessageCircle,
    badge: hasUnreadStaffChats.value,
  },
  {
    title: t('nav.rooms'),
    url: '/rooms',
    icon: DoorOpen,
  },
  {
    title: t('nav.finance'),
    icon: Banknote,
    items: [
      { title: t('nav.financePayments'), url: '/finance/payments' },
      { title: t('nav.financeServiceDocs'), url: '/finance/service-docs' },
    ],
  },
  {
    title: t('nav.reports'),
    icon: BarChart3,
    items: [
      { title: t('nav.reportsOccupancy'), url: '/reports/occupancy' },
      { title: t('nav.reportsContingent'), url: '/reports/contingent' },
      { title: t('nav.reportsContracts'), url: '/reports/contracts' },
      { title: t('nav.reportsDebt'), url: '/reports/debt' },
      { title: t('nav.reportsMoveInOut'), url: '/reports/move-in-out' },
    ],
  },
])

const data = computed(() => ({
  teams: [
    {
      name: t('sidebar.team'),
      plan: t('sidebar.teamPlan'),
    },
  ],
  projects: [
    { name: t('nav.sync'), url: '/sync', icon: RefreshCw },
    { name: t('nav.auditLog'), url: '/audit-log', icon: History },
    {
      name: t('sidebar.projectUsers'),
      icon: Users,
      items: [
        { title: t('nav.usersAll'), url: '/users-all' },
        { title: t('nav.users'), url: '/users' },
        { title: t('nav.roles'), url: '/roles' },
      ],
    },
    {
      name: t('sidebar.projectSystemTables'),
      icon: Table2,
      items: [
        { title: t('nav.students'), url: '/students' },
        { title: t('nav.citizenship'), url: '/system-tables/citizenship' },
        { title: t('nav.contactInfo'), url: '/system-tables/contact-info' },
        { title: t('nav.passportData'), url: '/system-tables/passport-data' },
        { title: t('nav.roomCharacteristics'), url: '/room-characteristics' },
      ],
    },
  ],
}))

function closeMobileMenuOnLink(event: MouseEvent) {
  if (isMobile.value && event.target instanceof Element && event.target.closest('a[href]')) {
    setOpenMobile(false)
  }
}
</script>

<template>
  <Sidebar v-bind="props">
    <SidebarHeader @click.capture="closeMobileMenuOnLink">
      <TeamSwitcher :teams="data.teams" />
    </SidebarHeader>
    <SidebarContent @click.capture="closeMobileMenuOnLink">
      <NavStudent :items="navStudent" />
      <NavMain v-if="canSeeStaffSection" :items="navMain" />
      <NavProjects v-if="canSeeAdminSection" :projects="data.projects" />
    </SidebarContent>
    <SidebarFooter>
      <NavUser :user="user" />
    </SidebarFooter>
    <SidebarRail />
  </Sidebar>
</template>
