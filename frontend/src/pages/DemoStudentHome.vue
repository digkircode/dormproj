<script setup lang="ts">
// Временная страница для демонстрации покупателю (по прямой просьбе 2026-09-04) —
// "Главная" проживающего с РЕАЛЬНЫМИ данными (не моковыми — тянет настоящий демо-договор
// и настоящие объявления через отдельные STAFF/ADMIN-эндпоинты), без переключения ролей на
// демо-аккаунте (обычно STAFF/ADMIN, без роли RESIDENT и без привязанного резидента).
// Доступна только прямой ссылкой /demo/student-home — в сайдбар не выведена, роут без
// meta.section (пропускает любого залогиненного, см. router/index.ts#sectionAllowed).
// Удалить, когда демонстрация больше не нужна — не часть продукта.
import { onMounted, ref } from 'vue'
import ResidentHomeDashboard from '@/components/ResidentHomeDashboard.vue'
import { fetchDemoContractHomeSummary, type MyContractHomeSummary } from '@/lib/contracts-api'
import { fetchAnnouncements, type ResidentAnnouncement } from '@/lib/announcements-api'

const contract = ref<MyContractHomeSummary | null>(null)
const announcements = ref<ResidentAnnouncement[]>([])
const isReady = ref(false)

onMounted(async () => {
  const [contractResult, staffAnnouncements] = await Promise.all([
    fetchDemoContractHomeSummary().catch(() => null),
    fetchAnnouncements().catch(() => []),
  ])
  contract.value = contractResult
  // Реальные объявления — сотруднический список (GET /announcements) не несёт
  // персонального признака "прочитано" (это per-резидент состояние, тут его взять не у
  // кого), поэтому просто false у всех — сама лента настоящая, не выдуманная.
  announcements.value = staffAnnouncements.map((a) => ({ ...a, unread: false }))
  isReady.value = true
})
</script>

<template>
  <ResidentHomeDashboard v-if="isReady" demo :demo-contract="contract" :demo-announcements="announcements" />
</template>
