<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SidebarProps } from '@/components/ui/sidebar'
import { ref } from 'vue'
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
  CreditCard,
} from 'lucide-vue-next'
import NavStudent from '@/components/NavStudent.vue'
import NavMain from '@/components/NavMain.vue'
import NavProjects from '@/components/NavProjects.vue'
import NavUser from '@/components/NavUser.vue'
import TeamSwitcher from '@/components/TeamSwitcher.vue'
import CreatePaymentDialog from '@/components/CreatePaymentDialog.vue'
import { currentUser } from '@/lib/auth-state'
import { useChatStream } from '@/lib/chat-stream'
import { fetchConversations, fetchMyChatUnread } from '@/lib/chat-api'
import { hasUnreadStaffChats, hasUnreadResidentChat } from '@/lib/chat-unread-state'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
} from '@/components/ui/sidebar'

const { t } = useI18n()
const paymentDialog = ref<InstanceType<typeof CreatePaymentDialog> | null>(null)

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
// Чат с сотрудниками — не всему разделу "Проживающий" (тот виден любому залогиненному),
// а только роли RESIDENT (плюс ADMIN по общему принципу "администратор видит всё") — тот
// же гейт, что в router/index.ts (meta.section:'resident').
const canSeeResidentChat = computed(() => isAdmin.value || roles.value.includes('RESIDENT'))
// Отдельно от canSeeResidentChat — та (по общему правилу "администратор видит всё")
// пускает и ADMIN без роли RESIDENT на страницу чата, но у такого аккаунта обычно нет
// привязанного физлица (см. my-chat.controller.ts#resolveIndividualUid) — держать для
// него открытым фоновое SSE-соединение под бейджик не нужно, оно только дёргало бы
// /my-chat/stream вхолостую. Сама страница (MyChat.vue) свой собственный edge case уже
// обрабатывает штатно (ошибка вместо пустого экрана), это не то же самое, что бейджик.
const hasResidentRole = computed(() => roles.value.includes('RESIDENT'))

// Видна всем залогиненным независимо от роли (в т.ч. без роли вообще) — см.
// router/index.ts, страницы этой группы без meta.section. Пункт чата — исключение,
// добавляется только при canSeeResidentChat, поэтому весь список стал computed.
const navStudent = computed(() => [
  {
    title: t('nav.studentGeneralInfo'),
    url: '/student/general-info',
    icon: Info,
  },
  ...(canSeeResidentChat.value
    ? [
        { title: t('nav.studentContract'), url: '/student/contract', icon: FileSignature },
        // "Оплата" (/student/payment) скрыта из навигации по прямой просьбе 2026-08-25 —
        // создание платежа теперь модалкой на карточке договора (см. CreatePaymentDialog.vue),
        // сам роут не удалён — нужен как returnUrl-цель после редиректа из банка
        // (см. my-payments.controller.ts#createIntent).
        { title: t('nav.studentChat'), url: '/student/chat', icon: MessageCircle, badge: hasUnreadResidentChat.value },
      ]
    : []),
])

async function refreshStaffUnread() {
  try {
    hasUnreadStaffChats.value = (await fetchConversations()).some((c) => c.unread)
  } catch {
    // Тихо игнорируем — бейджик просто не обновится до следующей попытки (следующий
    // SSE-эвент или ремаунт сайдбара), не роняем весь layout из-за индикатора.
  }
}
async function refreshResidentUnread() {
  try {
    hasUnreadResidentChat.value = await fetchMyChatUnread()
  } catch {
    // Тот же принцип, что и у refreshStaffUnread выше — сетевой сбой не должен ронять
    // бейджик в тихую ошибку без обновления, просто ждём следующей попытки (SSE/watch).
  }
}

watch(canSeeStaffSection, (value) => value && refreshStaffUnread(), { immediate: true })
watch(hasResidentRole, (value) => value && refreshResidentUnread(), { immediate: true })

// AppSidebar смонтирован всё время, пока пользователь залогинен (в отличие от
// Chats.vue/MyChat.vue, которые живут только на своих страницах) — эти два SSE-потока
// держат бейджик актуальным, даже когда человек находится совсем на другой странице.
useChatStream('/chats/stream', refreshStaffUnread, canSeeStaffSection)
useChatStream('/my-chat/stream', refreshResidentUnread, hasResidentRole)

// "Чаты" — единственный пункт с бейджиком, поэтому весь список computed (та же причина,
// что у navStudent выше).
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
</script>

<template>
  <Sidebar v-bind="props">
    <SidebarHeader>
      <TeamSwitcher :teams="data.teams" />
      <!-- Тонкая кнопка "Оплатить" прямо под РосНОУ/Общежитие — по прямой просьбе
           2026-08-25, делает ровно то же, что кнопка на карточке договора (открывает
           ту же модалку, contractId не передаём — дефолт "самый свежий договор"). -->
      <SidebarMenu v-if="canSeeResidentChat">
        <SidebarMenuItem>
          <SidebarMenuButton
            size="sm"
            class="justify-center bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
            @click="paymentDialog?.open()"
          >
            <CreditCard class="size-4" />
            <span>{{ t('nav.sidebarPay') }}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <CreatePaymentDialog ref="paymentDialog" />
    </SidebarHeader>
    <SidebarContent>
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
