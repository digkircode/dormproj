<script setup lang="ts">
import { computed } from 'vue'
import { currentUser } from '@/lib/auth-state'
import StaffHomeDashboard from '@/components/StaffHomeDashboard.vue'
import ResidentHomeDashboard from '@/components/ResidentHomeDashboard.vue'
import StudentGeneralInfo from '@/pages/StudentGeneralInfo.vue'

const roles = computed(() => currentUser.value?.roles ?? [])
const isStaff = computed(() => roles.value.includes('STAFF') || roles.value.includes('ADMIN'))
const isResident = computed(() => roles.value.includes('RESIDENT'))
</script>

<template>
  <StaffHomeDashboard v-if="isStaff" />
  <ResidentHomeDashboard v-else-if="isResident" />
  <StudentGeneralInfo v-else />
</template>
