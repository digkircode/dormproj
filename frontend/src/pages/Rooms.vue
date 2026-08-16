<script setup lang="ts">
import { ref } from 'vue'
import { Info, Plus } from 'lucide-vue-next'
import EntityTable from '@/components/EntityTable.vue'
import RoomDetailDialog from '@/components/RoomDetailDialog.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogScrollContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createAppColumnHelper } from '@/lib/table'
import { fetchFacetValues, fetchRooms, createRoom, type Room } from '@/lib/rooms-api'

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'

const columnLabels: Record<string, string> = {
  room: 'Номер',
  floor: 'Этаж',
}
const filterableFields = ['floor']

const columnHelper = createAppColumnHelper<Room>()

const columns = columnHelper.columns([
  columnHelper.accessor('room', { header: columnLabels.room, enableHiding: false, size: 200, minSize: 120 }),
  columnHelper.accessor('floor', { header: columnLabels.floor, size: 120, minSize: 90 }),
])

const table = ref<{ refresh: () => void | Promise<void> } | null>(null)

// Карточка комнаты — модалка поверх списка, а не отдельная страница (по прямой просьбе:
// открытие новой страницы для одной комнаты избыточно), см. RoomDetailDialog.vue.
const selectedRoomId = ref<number | null>(null)

const isCreateOpen = ref(false)
const newRoomNumber = ref('')
const createError = ref('')
const isCreating = ref(false)

async function submitCreate() {
  if (!newRoomNumber.value.trim()) return
  isCreating.value = true
  createError.value = ''
  try {
    await createRoom(newRoomNumber.value.trim())
    isCreateOpen.value = false
    newRoomNumber.value = ''
    table.value?.refresh()
  } catch (error) {
    createError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isCreating.value = false
  }
}
</script>

<template>
  <div class="flex flex-1 flex-col gap-4 p-4 md:p-6">
    <EntityTable
      ref="table"
      :columns="columns"
      :column-labels="columnLabels"
      :filterable-fields="filterableFields"
      :default-sort="{ id: 'room', desc: false }"
      :fetch-page="fetchRooms"
      :fetch-facet-values="fetchFacetValues"
      :get-row-id="(r: Room) => String(r.id)"
      total-label="комнат"
      storage-key="rooms"
      accent-icons
      :row-action="{
        icon: Info,
        label: 'Открыть карточку комнаты',
        onClick: (r: Room) => (selectedRoomId = r.id),
      }"
    >
      <template #actions>
        <Button size="icon" title="Добавить комнату" @click="isCreateOpen = true">
          <Plus />
          <span class="sr-only">Добавить комнату</span>
        </Button>
      </template>
    </EntityTable>

    <RoomDetailDialog
      :room-id="selectedRoomId"
      @update:room-id="(id) => (selectedRoomId = id)"
      @deleted="table?.refresh()"
      @renamed="table?.refresh()"
    />

    <Dialog :open="isCreateOpen" @update:open="(open) => (isCreateOpen = open)">
      <DialogScrollContent :class="['flex flex-col gap-4', DIALOG_ANIMATE_CLASS]">
        <DialogHeader>
          <DialogTitle>Новая комната</DialogTitle>
          <DialogDescription>Номер комнаты, например «405-2»</DialogDescription>
        </DialogHeader>
        <div class="flex flex-col gap-2">
          <Label for="new-room-number">Номер</Label>
          <Input id="new-room-number" v-model="newRoomNumber" placeholder="405-2" @keyup.enter="submitCreate" />
          <p v-if="createError" class="text-sm text-red-500">{{ createError }}</p>
        </div>
        <DialogFooter>
          <Button :disabled="isCreating || !newRoomNumber.trim()" @click="submitCreate">Создать</Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>
  </div>
</template>
