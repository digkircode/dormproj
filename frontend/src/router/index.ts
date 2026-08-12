import { createRouter, createWebHistory } from 'vue-router'
import Home from '@/pages/Home.vue'
import Sync from '@/pages/Sync.vue'
import Students from '@/pages/Students.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: Home, meta: { title: 'Главная' } },
    { path: '/students', name: 'students', component: Students, meta: { title: 'Контингент' } },
    { path: '/sync', name: 'sync', component: Sync, meta: { title: 'Синхронизация' } },
  ],
})

export default router
