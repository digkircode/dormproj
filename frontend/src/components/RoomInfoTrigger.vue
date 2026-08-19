<script setup lang="ts">
import { ref, watch } from 'vue'
import { DoorOpen } from 'lucide-vue-next'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { fetchRoomDetail, type RoomDetail } from '@/lib/rooms-api'

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
// Тот же порядок, что и в RoomDetailPanel.vue — сначала стартовые защищённые
// характеристики в фиксированном порядке, потом остальные по алфавиту.
const CORE_ORDER = ['Этаж', 'Жилое помещение', 'Количество мест', 'Площадь', 'Стоимость']

const props = defineProps<{ roomId: number | null; roomName: string | null }>()

const isOpen = ref(false)
const detail = ref<RoomDetail | null>(null)
const isLoading = ref(false)
const loadError = ref('')

function formatValue(entry: { valueType: string; value: boolean | number | string | null; unit: string | null }): string {
  if (entry.value === null || entry.value === undefined) return '—'
  if (entry.valueType === 'BOOLEAN') return entry.value ? 'Да' : 'Нет'
  return entry.unit ? `${entry.value} ${entry.unit}` : String(entry.value)
}

function sortedCharacteristics(list: RoomDetail['characteristics']) {
  return [...list].sort((a, b) => {
    const ai = CORE_ORDER.indexOf(a.name)
    const bi = CORE_ORDER.indexOf(b.name)
    if (ai !== -1 || bi !== -1) {
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    }
    return a.name.localeCompare(b.name, 'ru')
  })
}

watch(isOpen, async (open) => {
  if (!open || !props.roomId) return
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
})
</script>

<template>
  <button
    v-if="roomId"
    type="button"
    class="inline-flex items-center gap-1.5 hover:underline"
    @click="isOpen = true"
  >
    <DoorOpen class="size-4 shrink-0 text-muted-foreground" />
    {{ roomName ?? '—' }}
  </button>
  <span v-else>{{ roomName ?? '—' }}</span>

  <Dialog :open="isOpen" @update:open="(v) => (isOpen = v)">
    <DialogScrollContent :class="['flex flex-col gap-4', DIALOG_ANIMATE_CLASS]">
      <DialogHeader>
        <DialogTitle>Комната {{ roomName }}</DialogTitle>
      </DialogHeader>
      <p v-if="loadError" class="text-sm text-red-500">{{ loadError }}</p>
      <p v-if="isLoading" class="text-sm text-muted-foreground">Загрузка…</p>
      <!-- Только просмотр — та же сетка характеристик, что в RoomDetailPanel.vue, но без
           кнопок добавления/редактирования/истории: здесь нужна быстрая справка по комнате
           прямо из карточки договора, а не полноценное управление ей. -->
      <div v-if="detail" class="grid grid-cols-1 gap-0 overflow-hidden rounded-md border sm:grid-cols-2">
        <div
          v-for="(c, index) in sortedCharacteristics(detail.characteristics)"
          :key="c.id"
          class="flex items-center justify-between gap-2 px-3 py-2 text-sm"
          :class="[
            index % 2 === 1 ? 'sm:border-l sm:border-border' : '',
            index > 0 ? 'border-t border-border' : '',
            index === 1 ? 'sm:border-t-0' : '',
          ]"
        >
          <span class="text-muted-foreground">{{ c.name }}</span>
          <span class="font-medium">{{ formatValue(c) }}</span>
        </div>
      </div>
    </DialogScrollContent>
  </Dialog>
</template>
