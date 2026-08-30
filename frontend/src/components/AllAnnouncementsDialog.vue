<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Newspaper } from 'lucide-vue-next'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { dateLocaleTag } from '@/lib/format-locale'
import { markAnnouncementRead, type ResidentAnnouncement } from '@/lib/announcements-api'
import { iconBadgeColorClasses } from '@/lib/avatar-color'

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'

const props = defineProps<{ announcements: ResidentAnnouncement[] }>()
const emit = defineEmits<{ read: [id: number] }>()

const { t } = useI18n()

const isDialogOpen = ref(false)
// Несколько объявлений могут быть раскрыты одновременно (по клику каждое переключается
// независимо) — не единый accordion "только одно открыто за раз", т.к. так не оговорено.
const expandedIds = ref<Set<number>>(new Set())

function open() {
  isDialogOpen.value = true
}
defineExpose({ open })

async function toggle(announcement: ResidentAnnouncement) {
  const next = new Set(expandedIds.value)
  if (next.has(announcement.id)) {
    next.delete(announcement.id)
  } else {
    next.add(announcement.id)
    if (announcement.unread) {
      try {
        await markAnnouncementRead(announcement.id)
        emit('read', announcement.id)
      } catch {
        // best-effort — раскрытие текста не должно блокироваться сетевой ошибкой
      }
    }
  }
  expandedIds.value = next
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(dateLocaleTag(), { day: 'numeric', month: 'long', year: 'numeric' })
}
</script>

<template>
  <Dialog :open="isDialogOpen" @update:open="(v) => (isDialogOpen = v)">
    <DialogScrollContent :class="['flex max-h-[80vh] flex-col gap-4 sm:max-w-lg', DIALOG_ANIMATE_CLASS]">
      <DialogHeader>
        <DialogTitle>{{ t('announcements.allDialogTitle') }}</DialogTitle>
      </DialogHeader>

      <p v-if="!props.announcements.length" class="text-sm text-muted-foreground">{{ t('home.resident.announcementsEmpty') }}</p>
      <!-- Тот же "невзрачный" фон + синий hover, что и в превью на ResidentHomeDashboard.vue
           (по прямой просьбе 2026-08-30) — gap между блоками вместо divide-y, кнопка и
           раскрывающийся текст внутри ОДНОГО скруглённого блока, не разделены рамкой. -->
      <div v-else class="flex flex-col gap-2 overflow-y-auto">
        <div
          v-for="a in props.announcements"
          :key="a.id"
          class="rounded-lg bg-muted/50 transition-colors hover:bg-blue-50 dark:bg-muted/20 dark:hover:bg-blue-500/10"
        >
          <button type="button" class="flex w-full items-start gap-3 p-3 text-left" @click="toggle(a)">
            <div class="flex size-8 shrink-0 items-center justify-center rounded-lg" :class="iconBadgeColorClasses(a.id).container">
              <Newspaper class="size-4" :class="iconBadgeColorClasses(a.id).icon" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold">{{ a.title }}</p>
              <p class="text-xs text-muted-foreground">{{ formatDate(a.createdAt) }}</p>
            </div>
            <span v-if="a.unread" class="mt-1.5 size-2 shrink-0 rounded-full bg-blue-500" />
          </button>
          <!-- Плавное раскрытие через grid-template-rows 0fr→1fr (без замера высоты в JS) —
               тот же приём, что уже используется в проекте (RoomDetailPanel.vue/
               RoomInfoTrigger.vue, см. промпт). -->
          <div class="grid transition-[grid-template-rows] duration-200" :style="{ gridTemplateRows: expandedIds.has(a.id) ? '1fr' : '0fr' }">
            <div class="overflow-hidden">
              <p class="px-3 pb-3 pl-[3.25rem] text-sm whitespace-pre-wrap text-muted-foreground">{{ a.body }}</p>
            </div>
          </div>
        </div>
      </div>
    </DialogScrollContent>
  </Dialog>
</template>
