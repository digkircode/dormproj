<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Bell } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createNotificationLink, disconnectNotificationChannel, fetchNotificationChannels, type NotificationChannel, type NotificationChannelStatus } from '@/lib/notifications-api'

const { t } = useI18n()
const channels = ref<NotificationChannelStatus[]>([])
const busy = ref<NotificationChannel | null>(null)
const error = ref('')
let timer: ReturnType<typeof setInterval> | undefined

async function refresh() {
  try { channels.value = await fetchNotificationChannels() }
  catch { error.value = t('home.resident.notificationsError') }
}

async function toggle(item: NotificationChannelStatus) {
  busy.value = item.channel
  error.value = ''
  let tab: Window | null = null
  try {
    if (item.connected) await disconnectNotificationChannel(item.channel)
    else {
      tab = window.open('about:blank', '_blank')
      if (tab) tab.opener = null
      const url = await createNotificationLink(item.channel)
      if (tab) tab.location.href = url
      else window.location.assign(url)
    }
    await refresh()
  } catch { tab?.close(); error.value = t('home.resident.notificationsError') }
  finally { busy.value = null }
}

onMounted(() => { void refresh(); timer = setInterval(() => { void refresh() }, 10_000) })
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<template>
  <Card class="flex flex-col gap-3 p-6">
    <div class="flex items-center gap-2 font-medium"><Bell class="size-4 text-primary" />{{ t('home.resident.notificationsHeading') }}</div>
    <p class="text-sm text-muted-foreground">{{ t('home.resident.notificationsDescription') }}</p>
    <div v-for="item in channels" :key="item.channel" class="flex items-center justify-between gap-3 border-t pt-3 text-sm">
      <span>{{ item.channel === 'TELEGRAM' ? 'Telegram' : 'MAX' }}</span>
      <Button size="sm" :variant="item.connected ? 'outline' : 'default'" :disabled="busy !== null || !item.available" @click="toggle(item)">
        {{ item.connected ? t('home.resident.notificationsDisconnect') : item.available ? t('home.resident.notificationsConnect') : t('home.resident.notificationsSoon') }}
      </Button>
    </div>
    <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
  </Card>
</template>
