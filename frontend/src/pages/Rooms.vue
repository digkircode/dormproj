<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Card } from '@/components/ui/card'
import RoomTree from '@/components/RoomTree.vue'
import RoomDetailPanel from '@/components/RoomDetailPanel.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogScrollContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createRoom, fetchRoomsTree, type RoomTreeItem } from '@/lib/rooms-api'

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
// Скрывает нативные стрелочки +/- у <input type="number"> (Chrome/Safari + Firefox).
const NO_SPINNER_CLASS = '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'

const treeItems = ref<RoomTreeItem[]>([])
const isTreeLoading = ref(true)
const treeError = ref('')

async function loadTree() {
  isTreeLoading.value = true
  treeError.value = ''
  try {
    treeItems.value = await fetchRoomsTree()
  } catch (error) {
    treeError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isTreeLoading.value = false
  }
}

onMounted(loadTree)

// Карточка комнаты — панель справа от дерева на этой же странице, а не отдельная
// модалка/роут (по прямой просьбе), см. RoomDetailPanel.vue.
const selectedRoomId = ref<number | null>(null)

function onRoomDeleted() {
  selectedRoomId.value = null
  loadTree()
}

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
    const created = await createRoom(newRoomNumber.value.trim(), floor)
    isCreateOpen.value = false
    await loadTree()
    selectedRoomId.value = created.id
  } catch (error) {
    createError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isCreating.value = false
  }
}
</script>

<template>
  <div class="flex flex-1 flex-col gap-4 p-4 md:p-6">
    <p v-if="treeError" class="text-sm text-red-500">{{ treeError }}</p>

    <div class="grid flex-1 grid-cols-1 gap-4 md:h-[calc(100vh-11.5rem)] md:grid-cols-[300px_1fr]">
      <Card class="min-w-0 gap-0 overflow-hidden py-0">
        <RoomTree
          :items="treeItems"
          :selected-id="selectedRoomId"
          :is-loading="isTreeLoading"
          @select="(id) => (selectedRoomId = id)"
          @create="openCreate"
        />
      </Card>

      <Card class="min-w-0 gap-0 overflow-hidden py-0">
        <RoomDetailPanel :room-id="selectedRoomId" @deleted="onRoomDeleted" @changed="loadTree" />
      </Card>
    </div>

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
          <!-- Обычный native input, не Input.vue — та обёртка на type="number" не ловит
               v-model, а с ручным :value+@input через раз глотает нажатия (см.
               RoomDetailPanel.vue). Классы скопированы из Input.vue вручную. -->
          <input
            id="new-room-floor"
            v-model="newRoomFloor"
            type="number"
            placeholder="4"
            :class="[
              'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
              NO_SPINNER_CLASS,
            ]"
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
