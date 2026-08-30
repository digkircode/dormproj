<script setup lang="ts">
import { ref } from 'vue'
import { Megaphone } from 'lucide-vue-next'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { dateLocaleTag } from '@/lib/format-locale'
import { markAnnouncementRead, type ResidentAnnouncement } from '@/lib/announcements-api'
import { iconBadgeColorClasses } from '@/lib/avatar-color'

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'

// Отдельная событие 'read' (не мутируем announcement-проп напрямую) — родитель сам решает,
// как обновить свой список (ResidentHomeDashboard.vue), тот же принцип явного
// однонаправленного потока данных, что и у остальных диалогов проекта.
const emit = defineEmits<{ read: [id: number] }>()

const isDialogOpen = ref(false)
const current = ref<ResidentAnnouncement | null>(null)
const iconColors = ref(iconBadgeColorClasses(0))

// Открытие = прочтение (тот же принцип, что GET /my-chat) — по прямой просьбе
// пользователя: точка становится серой сразу при открытии модалки, не по отдельному
// действию внутри неё. Ошибку API молча игнорируем — это read-receipt, не блокирующее
// действие, пользователь уже увидел текст независимо от результата запроса.
async function open(announcement: ResidentAnnouncement) {
  current.value = announcement
  iconColors.value = iconBadgeColorClasses(announcement.id)
  isDialogOpen.value = true
  if (announcement.unread) {
    try {
      await markAnnouncementRead(announcement.id)
      emit('read', announcement.id)
    } catch {
      // best-effort — не мешаем чтению текста ошибкой сети
    }
  }
}

defineExpose({ open })

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(dateLocaleTag(), { day: 'numeric', month: 'long', year: 'numeric' })
}
</script>

<template>
  <Dialog :open="isDialogOpen" @update:open="(v) => (isDialogOpen = v)">
    <DialogScrollContent :class="['flex flex-col gap-4 sm:max-w-lg', DIALOG_ANIMATE_CLASS]">
      <DialogHeader>
        <div class="flex items-start gap-3">
          <div class="flex size-8 shrink-0 items-center justify-center rounded-lg" :class="iconColors.container">
            <Megaphone class="size-4" :class="iconColors.icon" />
          </div>
          <div class="min-w-0 flex-1">
            <DialogTitle class="text-left">{{ current?.title }}</DialogTitle>
            <p v-if="current" class="mt-0.5 text-xs text-muted-foreground">{{ formatDate(current.createdAt) }}</p>
          </div>
        </div>
      </DialogHeader>
      <p v-if="current" class="whitespace-pre-wrap text-sm">{{ current.body }}</p>
    </DialogScrollContent>
  </Dialog>
</template>
