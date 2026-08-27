<script setup lang="ts">
import { computed } from 'vue'
import { currentUser } from '@/lib/auth-state'
import StaffHomeDashboard from '@/components/StaffHomeDashboard.vue'
import MyContract from '@/pages/MyContract.vue'
import StudentGeneralInfo from '@/pages/StudentGeneralInfo.vue'

// "Главная" — не одна и та же страница для всех (по прямой просьбе 2026-08-27): у
// STAFF/ADMIN — реальный дашборд (см. StaffHomeDashboard.vue), у чистого RESIDENT — сразу
// его договор/оплата (та же страница, что и на /student/contract), без роли вообще —
// общая информация об общежитии (та же, что на /student/general-info). Гибридный аккаунт
// (например STAFF+RESIDENT) получает дашборд сотрудника — тот же приоритет, что и в
// сайдбаре/router-гварде (см. sectionAllowed в router/index.ts).
const roles = computed(() => currentUser.value?.roles ?? [])
const isStaff = computed(() => roles.value.includes('STAFF') || roles.value.includes('ADMIN'))
const isResident = computed(() => roles.value.includes('RESIDENT'))
</script>

<template>
  <StaffHomeDashboard v-if="isStaff" />
  <MyContract v-else-if="isResident" />
  <StudentGeneralInfo v-else />
</template>
