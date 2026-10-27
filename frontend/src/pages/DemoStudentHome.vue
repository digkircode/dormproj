<script setup lang="ts">
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
  announcements.value = staffAnnouncements.map((a) => ({ ...a, unread: false }))
  isReady.value = true
})
</script>

<template>
  <ResidentHomeDashboard v-if="isReady" demo :demo-contract="contract" :demo-announcements="announcements" />
</template>
