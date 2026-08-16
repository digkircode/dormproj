<script setup lang="ts">
import { ref } from 'vue'
import { ExternalLink, Plus } from 'lucide-vue-next'
import EntityTable from '@/components/EntityTable.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createAppColumnHelper } from '@/lib/table'
import { fetchFacetValues, fetchRooms, createRoom, type Room } from '@/lib/rooms-api'

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
    <div class="flex justify-end">
      <Button size="sm" @click="isCreateOpen = true">
        <Plus />
        Добавить комнату
      </Button>
    </div>

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
        icon: ExternalLink,
        label: 'Открыть карточку комнаты',
        getHref: (r: Room) => `/rooms/${r.id}`,
      }"
    />

    <Dialog :open="isCreateOpen" @update:open="(open) => (isCreateOpen = open)">
      <DialogContent>
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
      </DialogContent>
    </Dialog>
  </div>
</template>
