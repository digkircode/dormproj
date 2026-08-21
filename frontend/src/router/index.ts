import { createRouter, createWebHistory } from 'vue-router'
import { trackBreadcrumbs } from '@/lib/breadcrumb-state'
import { currentUser, ensureUserLoaded } from '@/lib/auth-state'
import type { RoleName } from '@/lib/auth-api'
import Home from '@/pages/Home.vue'
import Forbidden from '@/pages/Forbidden.vue'
import Sync from '@/pages/Sync.vue'
import SyncLogs from '@/pages/SyncLogs.vue'
import Students from '@/pages/Students.vue'
import Individuals from '@/pages/Individuals.vue'
import IndividualDetail from '@/pages/IndividualDetail.vue'
import Citizenship from '@/pages/Citizenship.vue'
import Passport from '@/pages/Passport.vue'
import ContactInfo from '@/pages/ContactInfo.vue'
import Rooms from '@/pages/Rooms.vue'
import RoomCharacteristics from '@/pages/RoomCharacteristics.vue'
import Contracts from '@/pages/Contracts.vue'
import ContractDetail from '@/pages/ContractDetail.vue'
import ReportsOccupancy from '@/pages/ReportsOccupancy.vue'
import ReportsContingent from '@/pages/ReportsContingent.vue'
import ReportsContractsRegistry from '@/pages/ReportsContractsRegistry.vue'
import ReportsDebt from '@/pages/ReportsDebt.vue'
import ReportsMovements from '@/pages/ReportsMovements.vue'
import UsersStaff from '@/pages/UsersStaff.vue'
import UsersRoles from '@/pages/UsersRoles.vue'

// Первый этап ролевой модели (см. промпт проекта) — секция страницы определяет, кому
// она видна: 'staff' — группа "Сотрудник" в сайдбаре (AppSidebar.vue/NavMain.vue),
// 'admin' — группа "Администратор" (NavProjects.vue), без section — доступно всем
// залогиненным независимо от роли (сейчас только "Главная"). Администратор видит всё.
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: Home, meta: { title: 'Главная' } },
    { path: '/403', name: 'forbidden', component: Forbidden, meta: { title: 'Доступ запрещён' } },
    { path: '/students', name: 'students', component: Students, meta: { title: 'Контингент', section: 'admin' } },
    { path: '/sync', name: 'sync', component: Sync, meta: { title: 'Синхронизация', section: 'admin' } },
    {
      path: '/sync/:slug/logs',
      name: 'sync-logs',
      component: SyncLogs,
      meta: { title: 'Логи синхронизации', parent: 'sync', section: 'admin' },
    },

    { path: '/individuals', name: 'individuals', component: Individuals, meta: { title: 'Физические лица', section: 'staff' } },
    {
      path: '/individuals/:uid',
      name: 'individual-detail',
      component: IndividualDetail,
      meta: { title: 'Физическое лицо', parent: 'individuals', section: 'staff' },
    },
    { path: '/system-tables/citizenship', name: 'citizenship', component: Citizenship, meta: { title: 'Гражданство', section: 'admin' } },
    {
      path: '/system-tables/contact-info',
      name: 'contact-info',
      component: ContactInfo,
      meta: { title: 'Контактная информация', section: 'admin' },
    },
    {
      path: '/system-tables/passport-data',
      name: 'passport-data',
      component: Passport,
      meta: { title: 'Паспортные данные', section: 'admin' },
    },

    { path: '/rooms', name: 'rooms', component: Rooms, meta: { title: 'Комнаты', section: 'staff' } },
    {
      path: '/room-characteristics',
      name: 'room-characteristics',
      component: RoomCharacteristics,
      meta: { title: 'Характеристики комнат', section: 'admin' },
    },

    { path: '/contracts', name: 'contracts', component: Contracts, meta: { title: 'Договоры', section: 'staff' } },
    {
      path: '/contracts/:id',
      name: 'contract-detail',
      component: ContractDetail,
      meta: { title: 'Информация о договоре', parent: 'contracts', section: 'staff' },
    },

    { path: '/reports', name: 'reports', redirect: '/reports/debt', meta: { title: 'Отчёты', section: 'staff' } },
    {
      path: '/reports/occupancy',
      name: 'reports-occupancy',
      component: ReportsOccupancy,
      meta: { title: 'Занятость общежития', parent: 'reports', section: 'staff' },
    },
    {
      path: '/reports/contingent',
      name: 'reports-contingent',
      component: ReportsContingent,
      meta: { title: 'Реестр проживающих', parent: 'reports', section: 'staff' },
    },
    {
      path: '/reports/contracts',
      name: 'reports-contracts',
      component: ReportsContractsRegistry,
      meta: { title: 'Реестр договоров', parent: 'reports', section: 'staff' },
    },
    {
      path: '/reports/debt',
      name: 'reports-debt',
      component: ReportsDebt,
      meta: { title: 'Финансовый отчёт', parent: 'reports', section: 'staff' },
    },
    {
      path: '/reports/move-in-out',
      name: 'reports-move-in-out',
      component: ReportsMovements,
      meta: { title: 'Заселение / выселение', parent: 'reports', section: 'staff' },
    },

    { path: '/users', name: 'users', component: UsersStaff, meta: { title: 'Сотрудники', section: 'admin' } },
    { path: '/roles', name: 'roles', component: UsersRoles, meta: { title: 'Роли', section: 'admin' } },
  ],
})

function sectionAllowed(roles: RoleName[] | undefined, section: unknown): boolean {
  if (section !== 'staff' && section !== 'admin') return true
  if (!roles?.length) return false
  if (roles.includes('ADMIN')) return true
  return section === 'staff' && roles.includes('STAFF')
}

// currentUser===null здесь означает либо "ещё не авторизован" (App.vue сам уводит на
// rosnou-id логин — дублировать это тут не нужно), либо "уже разлогинен" — в обоих
// случаях просто пропускаем навигацию, решение не по роли, а по самой сессии остаётся
// за App.vue.
router.beforeEach(async (to) => {
  await ensureUserLoaded()
  if (!currentUser.value) return true
  if (to.name === 'forbidden') return true
  if (sectionAllowed(currentUser.value.roles, to.meta.section)) return true
  return { name: 'forbidden' }
})

trackBreadcrumbs(router)

export default router
