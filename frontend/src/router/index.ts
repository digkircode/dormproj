import { createRouter, createWebHistory } from 'vue-router'
import Home from '@/pages/Home.vue'
import Sync from '@/pages/Sync.vue'
import Students from '@/pages/Students.vue'
import Individuals from '@/pages/Individuals.vue'
import Citizenship from '@/pages/Citizenship.vue'
import Passport from '@/pages/Passport.vue'
import Placeholder from '@/pages/Placeholder.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: Home, meta: { title: 'Главная' } },
    { path: '/students', name: 'students', component: Students, meta: { title: 'Контингент' } },
    { path: '/sync', name: 'sync', component: Sync, meta: { title: 'Синхронизация' } },

    { path: '/individuals', name: 'individuals', component: Individuals, meta: { title: 'Физические лица' } },
    { path: '/system-tables/citizenship', name: 'citizenship', component: Citizenship, meta: { title: 'Гражданство' } },
    { path: '/system-tables/contact-info', name: 'contact-info', component: Placeholder, meta: { title: 'Контактная информация' } },
    { path: '/system-tables/passport-data', name: 'passport-data', component: Passport, meta: { title: 'Паспортные данные' } },
  ],
})

export default router
