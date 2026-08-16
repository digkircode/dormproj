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
// Скрывает нативные стрелочки +/- у <input type="number"> (Chrome/Safari + Firefox).
const NO_SPINNER_CLASS = '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'

const columnLabels: Record<string, string> = {
  room: 'Номер',
}

const columnHelper = createAppColumnHelper<Room>()

const columns = columnHelper.columns([
  columnHelper.accessor('room', { header: columnLabels.room, enableHiding: false, size: 200, minSize: 120 }),
])

const table = ref<{ refresh: () => void | Promise<void> } | null>(null)

// Карточка комнаты — модалка поверх списка, а не отдельная страница (по прямой просьбе:
// открытие новой страницы для одной комнаты избыточно), см. RoomDetailDialog.vue.
const selectedRoomId = ref<number | null>(null)

const isCreateOpen = ref(false)
const newRoomNumber = ref('')
const newRoomFloor = ref('')
const createError = ref('')
const isCreating = ref(false)

function openCreate() {
  newRoomNumber.value = ''
  newRoomFloor.value = ''
  createError.value = ''
  isCreateOpen.value = true
}

async function submitCreate() {
  const floor = Number(newRoomFloor.value)
  if (!newRoomNumber.value.trim() || !Number.isFinite(floor) || newRoomFloor.value.trim() === '') return
  isCreating.value = true
  createError.value = ''
  try {
    await createRoom(newRoomNumber.value.trim(), floor)
    isCreateOpen.value = false
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
      :filterable-fields="[]"
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
        <Button size="icon" title="Добавить комнату" @click="openCreate">
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
          <DialogDescription>Номер комнаты и этаж — дальше остальные характеристики можно добавить на карточке комнаты</DialogDescription>
        </DialogHeader>
        <div class="flex flex-col gap-2">
          <Label for="new-room-number">Номер</Label>
          <Input id="new-room-number" v-model="newRoomNumber" placeholder="405-2" @keyup.enter="submitCreate" />
        </div>
        <div class="flex flex-col gap-2">
          <Label for="new-room-floor">Этаж</Label>
          <!-- v-model на Input.vue с type="number" не ловит ввод (см. RoomDetailDialog.vue) —
               обход через родной @input. -->
          <Input
            id="new-room-floor"
            :value="newRoomFloor"
            type="number"
            :class="NO_SPINNER_CLASS"
            placeholder="4"
            @input="(e: Event) => (newRoomFloor = (e.target as HTMLInputElement).value)"
            @keyup.enter="submitCreate"
          />
        </div>
        <p v-if="createError" class="text-sm text-red-500">{{ createError }}</p>
        <DialogFooter>
          <Button variant="outline" @click="isCreateOpen = false">Отмена</Button>
          <Button :disabled="isCreating || !newRoomNumber.trim() || !newRoomFloor.trim()" @click="submitCreate">Создать</Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>
  </div>
</template>
