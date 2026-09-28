<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Bell, Check, MessageCircleMore } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { createNotificationLink, disconnectNotificationChannel, fetchNotificationChannels, type NotificationChannel, type NotificationChannelStatus } from '@/lib/notifications-api'

const { t } = useI18n()
const channels = ref<NotificationChannelStatus[]>([])
const busy = ref<NotificationChannel | null>(null)
const error = ref('')
let timer: ReturnType<typeof setInterval> | undefined

async function refresh() {
  try { channels.value = await fetchNotificationChannels(); error.value = '' }
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
  <section class="mt-4 w-full max-w-lg rounded-2xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-background to-background p-4 shadow-sm dark:border-sky-500/20 dark:from-sky-500/10" :aria-label="t('home.resident.notificationsHeading')">
    <div class="flex items-start gap-3">
      <div class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">
        <Bell class="size-4" />
      </div>
      <div class="min-w-0">
        <h2 class="text-sm font-semibold">{{ t('home.resident.notificationsHeading') }}</h2>
        <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">{{ t('home.resident.notificationsTagline') }}</p>
      </div>
    </div>
    <div class="mt-3 flex flex-col gap-2">
      <div v-for="item in channels" :key="item.channel" class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-background/85 px-3 py-2.5 shadow-xs">
        <div class="flex size-9 shrink-0 items-center justify-center rounded-full" :class="item.channel === 'TELEGRAM' ? 'bg-[#26A5E4] text-white' : 'bg-violet-600 text-white'">
          <svg v-if="item.channel === 'TELEGRAM'" viewBox="0 0 24 24" aria-hidden="true" class="size-5 fill-current">
            <path d="M20.665 3.717 2.934 10.554c-1.21.486-1.203 1.16-.222 1.46l4.552 1.42 10.532-6.645c.498-.303.953-.14.579.192l-8.532 7.7-.316 4.77c.463 0 .667-.212.926-.463l2.22-2.158 4.617 3.411c.85.469 1.46.228 1.67-.787l3.02-14.234c.309-1.24-.474-1.801-1.315-1.503Z" />
          </svg>
          <MessageCircleMore v-else class="size-5" aria-hidden="true" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-semibold">{{ item.channel === 'TELEGRAM' ? 'Telegram' : 'MAX' }}</p>
          <p class="flex items-center gap-1 text-xs" :class="item.connected ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'">
            <Check v-if="item.connected" class="size-3" aria-hidden="true" />
            {{ item.connected ? t('home.resident.notificationsConnected') : item.available ? t('home.resident.notificationsNotConnected') : t('home.resident.notificationsSoon') }}
          </p>
        </div>
        <Button size="sm" :variant="item.connected ? 'ghost' : 'outline'" :loading="busy === item.channel" :disabled="busy !== null || !item.available" class="ml-auto" @click="toggle(item)">
          {{ item.connected ? t('home.resident.notificationsDisconnect') : item.available ? t('home.resident.notificationsConnect') : t('home.resident.notificationsSoon') }}
        </Button>
      </div>
    </div>
    <p v-if="error" role="alert" class="mt-2 text-sm text-destructive">{{ error }}</p>
  </section>
</template>
