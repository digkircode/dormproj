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
import { blockScientificNotationKeys } from '@/lib/utils'

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
// Клик по корню дерева ("Общежитие РосНОУ") — отдельный режим, показывает в
// RoomDetailPanel компактную карточку общежитских полей вместо конкретной комнаты.
const showDormitoryInfo = ref(false)

function onRoomSelect(id: number) {
  showDormitoryInfo.value = false
  selectedRoomId.value = id
}

function onDormitorySelect() {
  showDormitoryInfo.value = true
  selectedRoomId.value = null
}

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
  // v-model на <input type="number"> сам приводит значение к number на вводе (даже без
  // модификатора .number) — newRoomFloor.value бывает и строкой (пусто), и числом,
  // String(...) перед trim() нужен, чтобы не словить "x.trim is not a function".
  const floorRaw = String(newRoomFloor.value).trim()
  const floor = Number(floorRaw)
  if (!newRoomNumber.value.trim() || floorRaw === '' || !Number.isFinite(floor)) return
  isCreating.value = true
  createError.value = ''
  try {
    const created = await createRoom(newRoomNumber.value.trim(), floor)
    isCreateOpen.value = false
    await loadTree()
    showDormitoryInfo.value = false
    selectedRoomId.value = created.id
  } catch (error) {
    createError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isCreating.value = false
  }
}
</script>

<template>
  <!-- h-full + min-h-0 — берём всю высоту, которую даёт App.vue (SidebarInset ограничен
       h-svh), а не гадаем константу под высоту хедера через calc(100vh-Xrem) (та плыла
       при любой правке шапки и не работала на мобильном). min-h-0 обязателен — иначе
       flex-элемент отказывается сжиматься ниже размера контента, и вся страница снова
       растягивается вместо внутреннего скролла (см. тот же приём в RoomDetailPanel.vue). -->
  <div class="flex h-full min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <p v-if="treeError" class="shrink-0 text-sm text-red-500">{{ treeError }}</p>

    <!-- На мобильном — 2 явных ряда (дерево фиксированной высоты сверху, карточка комнаты —
         оставшееся), на md — снова 1 ряд, колонки вместо рядов. -->
    <div class="grid min-h-0 flex-1 grid-cols-1 grid-rows-[280px_minmax(0,1fr)] gap-4 md:grid-rows-1 md:grid-cols-[360px_1fr]">
      <Card class="min-h-0 min-w-0 gap-0 overflow-hidden py-0">
        <RoomTree
          :items="treeItems"
          :selected-id="selectedRoomId"
          :is-loading="isTreeLoading"
          :is-dormitory-selected="showDormitoryInfo"
          @select="onRoomSelect"
          @select-dormitory="onDormitorySelect"
          @create="openCreate"
        />
      </Card>

      <Card class="min-h-0 min-w-0 gap-0 overflow-hidden py-0">
        <RoomDetailPanel :room-id="selectedRoomId" :show-dormitory-info="showDormitoryInfo" @deleted="onRoomDeleted" @changed="loadTree" />
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
          <Input id="new-room-number" v-model="newRoomNumber" @keyup.enter="submitCreate" />
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
            :class="[
              'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
              NO_SPINNER_CLASS,
            ]"
            @keydown="blockScientificNotationKeys"
            @keyup.enter="submitCreate"
          />
        </div>
        <p v-if="createError" class="text-sm text-red-500">{{ createError }}</p>
        <DialogFooter>
          <Button variant="outline" @click="isCreateOpen = false">Отмена</Button>
          <Button :disabled="isCreating || !newRoomNumber.trim() || String(newRoomFloor).trim() === ''" @click="submitCreate">Создать</Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>
  </div>
</template>
