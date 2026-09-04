import { createRouter, createWebHistory } from 'vue-router'
import { trackBreadcrumbs } from '@/lib/breadcrumb-state'
import { currentUser, ensureUserLoaded } from '@/lib/auth-state'
import type { RoleName } from '@/lib/auth-api'
import Home from '@/pages/Home.vue'
import Forbidden from '@/pages/Forbidden.vue'
import NotFound from '@/pages/NotFound.vue'
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
// Файл называется PaymentImports.vue (не переименован — тот же приём, что у
// Students.vue/«Контингент студентов», см. промпт проекта), но роут/пункт сайдбара —
// «Платежи» (флоу 1/2 обмена с 1С Бухгалтерией), подпункт группы «Финансы».
import Finance from '@/pages/PaymentImports.vue'
import ServiceProvisionDocuments from '@/pages/ServiceProvisionDocuments.vue'
import ReportsOccupancy from '@/pages/ReportsOccupancy.vue'
import ReportsContingent from '@/pages/ReportsContingent.vue'
import ReportsContractsRegistry from '@/pages/ReportsContractsRegistry.vue'
import ReportsDebt from '@/pages/ReportsDebt.vue'
import ReportsMovements from '@/pages/ReportsMovements.vue'
import UsersStaff from '@/pages/UsersStaff.vue'
import UsersRoles from '@/pages/UsersRoles.vue'
import UsersList from '@/pages/UsersList.vue'
import AuditLog from '@/pages/AuditLog.vue'
import StudentGeneralInfo from '@/pages/StudentGeneralInfo.vue'
import Chats from '@/pages/Chats.vue'
import MyChat from '@/pages/MyChat.vue'
import MyContract from '@/pages/MyContract.vue'
import MyPayment from '@/pages/MyPayment.vue'
import DemoStudentHome from '@/pages/DemoStudentHome.vue'

// Первый этап ролевой модели (см. промпт проекта) — секция страницы определяет, кому
// она видна: 'staff' — группа "Сотрудник" в сайдбаре (AppSidebar.vue/NavMain.vue),
// 'admin' — группа "Администратор" (NavProjects.vue), без section — доступно всем
// залогиненным независимо от роли (сейчас только "Главная"). Администратор видит всё.
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: Home, meta: { title: 'nav.home' } },
    { path: '/403', name: 'forbidden', component: Forbidden, meta: { title: 'nav.forbidden' } },
    // Без section — доступна всем залогиненным независимо от роли (в т.ч. без роли
    // вообще), тот же принцип, что у "Главной" — секция "Студент" в сайдбаре видна всем.
    { path: '/student/general-info', name: 'student-general-info', component: StudentGeneralInfo, meta: { title: 'nav.studentGeneralInfo' } },
    // Временная демо-страница для показа покупателю (см. промпт проекта) — без
    // meta.section, доступна любому залогиненному по прямой ссылке, в сайдбар не выведена.
    // Удалить вместе с DemoStudentHome.vue, когда демонстрация больше не нужна.
    { path: '/demo/student-home', name: 'demo-student-home', component: DemoStudentHome, meta: { title: 'nav.demoStudentHome' } },
    // section: 'resident' — не "доступно всем", как остальной раздел "Проживающий" выше,
    // а только роли RESIDENT (плюс ADMIN по общему для приложения принципу "администратор
    // видит всё") — уточнено с пользователем отдельно при планировании чата.
    { path: '/student/chat', name: 'student-chat', component: MyChat, meta: { title: 'nav.studentChat', section: 'resident' } },
    // Свой договор — тот же гейт, что у чата (см. sectionAllowed ниже): доступ по
    // individualUid из сессии на бэке (my-contract.controller.ts), без :id в маршруте.
    { path: '/student/contract', name: 'student-contract', component: MyContract, meta: { title: 'nav.studentContract', section: 'resident' } },
    { path: '/student/payment', name: 'student-payment', component: MyPayment, meta: { title: 'nav.studentPayment', section: 'resident' } },
    { path: '/students', name: 'students', component: Students, meta: { title: 'nav.students', section: 'admin' } },
    { path: '/sync', name: 'sync', component: Sync, meta: { title: 'nav.sync', section: 'admin' } },
    {
      path: '/sync/:slug/logs',
      name: 'sync-logs',
      component: SyncLogs,
      meta: { title: 'nav.syncLogs', parent: 'sync', section: 'admin' },
    },

    { path: '/individuals', name: 'individuals', component: Individuals, meta: { title: 'nav.individuals', section: 'staff' } },
    {
      path: '/individuals/:uid',
      name: 'individual-detail',
      component: IndividualDetail,
      meta: { title: 'nav.individualDetail', parent: 'individuals', section: 'staff' },
    },
    { path: '/system-tables/citizenship', name: 'citizenship', component: Citizenship, meta: { title: 'nav.citizenship', section: 'admin' } },
    {
      path: '/system-tables/contact-info',
      name: 'contact-info',
      component: ContactInfo,
      meta: { title: 'nav.contactInfo', section: 'admin' },
    },
    {
      path: '/system-tables/passport-data',
      name: 'passport-data',
      component: Passport,
      meta: { title: 'nav.passportData', section: 'admin' },
    },

    { path: '/rooms', name: 'rooms', component: Rooms, meta: { title: 'nav.rooms', section: 'staff' } },
    {
      path: '/room-characteristics',
      name: 'room-characteristics',
      component: RoomCharacteristics,
      meta: { title: 'nav.roomCharacteristics', section: 'admin' },
    },

    { path: '/contracts', name: 'contracts', component: Contracts, meta: { title: 'nav.contracts', section: 'staff' } },
    { path: '/chats', name: 'chats', component: Chats, meta: { title: 'nav.chats', section: 'staff' } },
    {
      path: '/contracts/:id',
      name: 'contract-detail',
      component: ContractDetail,
      meta: { title: 'nav.contractDetail', parent: 'contracts', section: 'staff' },
    },
    { path: '/finance', name: 'finance', redirect: '/finance/payments', meta: { title: 'nav.finance', section: 'staff' } },
    {
      path: '/finance/payments',
      name: 'finance-payments',
      component: Finance,
      meta: { title: 'nav.financePayments', parent: 'finance', section: 'staff' },
    },
    {
      path: '/finance/service-docs',
      name: 'finance-service-docs',
      component: ServiceProvisionDocuments,
      meta: { title: 'nav.financeServiceDocs', parent: 'finance', section: 'staff' },
    },

    { path: '/reports', name: 'reports', redirect: '/reports/debt', meta: { title: 'nav.reports', section: 'staff' } },
    {
      path: '/reports/occupancy',
      name: 'reports-occupancy',
      component: ReportsOccupancy,
      meta: { title: 'nav.reportsOccupancy', parent: 'reports', section: 'staff' },
    },
    {
      path: '/reports/contingent',
      name: 'reports-contingent',
      component: ReportsContingent,
      meta: { title: 'nav.reportsContingent', parent: 'reports', section: 'staff' },
    },
    {
      path: '/reports/contracts',
      name: 'reports-contracts',
      component: ReportsContractsRegistry,
      meta: { title: 'nav.reportsContracts', parent: 'reports', section: 'staff' },
    },
    {
      path: '/reports/debt',
      name: 'reports-debt',
      component: ReportsDebt,
      meta: { title: 'nav.reportsDebt', parent: 'reports', section: 'staff' },
    },
    {
      path: '/reports/move-in-out',
      name: 'reports-move-in-out',
      component: ReportsMovements,
      meta: { title: 'nav.reportsMoveInOut', parent: 'reports', section: 'staff' },
    },

    { path: '/users', name: 'users', component: UsersStaff, meta: { title: 'nav.users', section: 'admin' } },
    { path: '/roles', name: 'roles', component: UsersRoles, meta: { title: 'nav.roles', section: 'admin' } },
    { path: '/users-all', name: 'users-all', component: UsersList, meta: { title: 'nav.usersAll', section: 'admin' } },
    { path: '/audit-log', name: 'audit-log', component: AuditLog, meta: { title: 'nav.auditLog', section: 'admin' } },

    // Catch-all — обязательно последним (vue-router matches по порядку регистрации при
    // равной специфичности). Без section — sectionAllowed() ниже пропускает её как есть,
    // тот же путь, что у "Главной"/"Общей информации", доступна любому залогиненному.
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFound, meta: { title: 'nav.notFound' } },
  ],
})

function sectionAllowed(roles: RoleName[] | undefined, section: unknown): boolean {
  // 'resident' — отдельная ветка от 'staff'/'admin' ниже: там ADMIN проходит просто
  // потому что не 'staff'/'admin', здесь — по тому же общему принципу "администратор
  // видит всё", но явно, вместе с самой ролью RESIDENT.
  if (section === 'resident') return !!roles?.includes('ADMIN') || !!roles?.includes('RESIDENT')
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
