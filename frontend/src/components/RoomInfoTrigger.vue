<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { DoorOpen } from 'lucide-vue-next'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import RoomCharacteristicsGrid from '@/components/RoomCharacteristicsGrid.vue'
import { fetchRoomDetail, type RoomDetail } from '@/lib/rooms-api'

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'

const { t } = useI18n()

const props = defineProps<{ roomId: number | null; roomName: string | null }>()

const isOpen = ref(false)
const detail = ref<RoomDetail | null>(null)
const isLoading = ref(false)
const loadError = ref('')

// Грузим ДО открытия диалога, не в watch(isOpen) после — иначе сетка на мгновение
// показывала "Загрузка…" уже внутри открытого диалога (тот же фикс, что и в
// ReportsOccupancy.vue). По прямой просьбе для карточки договора/списка договоров.
async function openDialog() {
  if (!props.roomId) return
  isLoading.value = true
  loadError.value = ''
  detail.value = null
  try {
    detail.value = await fetchRoomDetail(props.roomId)
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isLoading.value = false
  }
  isOpen.value = true
}
</script>

<template>
  <Tooltip v-if="roomId">
    <TooltipTrigger as-child>
      <button
        type="button"
        class="-mx-1.5 -my-0.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-60"
        :disabled="isLoading"
        @click="openDialog"
      >
        <DoorOpen class="size-4 shrink-0 text-primary" />
        {{ roomName ?? '—' }}
      </button>
    </TooltipTrigger>
    <TooltipContent>{{ t('roomInfo.tooltip') }}</TooltipContent>
  </Tooltip>
  <span v-else>{{ roomName ?? '—' }}</span>

  <Dialog :open="isOpen" @update:open="(v) => (isOpen = v)">
    <DialogScrollContent :class="['flex flex-col gap-4', DIALOG_ANIMATE_CLASS]">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-1.5">
          <DoorOpen class="size-4 shrink-0 text-primary" />
          {{ t('roomInfo.dialogTitle', { room: roomName }) }}
        </DialogTitle>
      </DialogHeader>
      <p v-if="loadError" class="text-sm text-red-500">{{ loadError }}</p>
      <p v-if="isLoading" class="text-sm text-muted-foreground">{{ t('entityTable.loading') }}</p>
      <!-- Только просмотр — не кликабельная (см. RoomCharacteristicsGrid.vue), без кнопок
           добавления/редактирования/истории: здесь нужна быстрая справка по комнате прямо
           из карточки договора, а не полноценное управление ей. -->
      <RoomCharacteristicsGrid v-if="detail" :rows="detail.characteristics" />
    </DialogScrollContent>
  </Dialog>
</template>
