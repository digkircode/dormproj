import { createRouter, createWebHistory } from 'vue-router'
import { trackBreadcrumbs } from '@/lib/breadcrumb-state'
import Home from '@/pages/Home.vue'
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
import Reports from '@/pages/Reports.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: Home, meta: { title: 'Главная' } },
    { path: '/students', name: 'students', component: Students, meta: { title: 'Контингент' } },
    { path: '/sync', name: 'sync', component: Sync, meta: { title: 'Синхронизация' } },
    { path: '/sync/:slug/logs', name: 'sync-logs', component: SyncLogs, meta: { title: 'Логи синхронизации', parent: 'sync' } },

    { path: '/individuals', name: 'individuals', component: Individuals, meta: { title: 'Физические лица' } },
    { path: '/individuals/:uid', name: 'individual-detail', component: IndividualDetail, meta: { title: 'Физическое лицо', parent: 'individuals' } },
    { path: '/system-tables/citizenship', name: 'citizenship', component: Citizenship, meta: { title: 'Гражданство' } },
    { path: '/system-tables/contact-info', name: 'contact-info', component: ContactInfo, meta: { title: 'Контактная информация' } },
    { path: '/system-tables/passport-data', name: 'passport-data', component: Passport, meta: { title: 'Паспортные данные' } },

    { path: '/rooms', name: 'rooms', component: Rooms, meta: { title: 'Комнаты' } },
    { path: '/room-characteristics', name: 'room-characteristics', component: RoomCharacteristics, meta: { title: 'Характеристики комнат' } },

    { path: '/contracts', name: 'contracts', component: Contracts, meta: { title: 'Договоры' } },
    { path: '/contracts/:id', name: 'contract-detail', component: ContractDetail, meta: { title: 'Информация о договоре', parent: 'contracts' } },
    { path: '/reports', name: 'reports', component: Reports, meta: { title: 'Отчёты' } },
  ],
})

trackBreadcrumbs(router)

export default router
