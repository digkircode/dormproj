<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  fetchRoomDetail,
  updateRoom,
  deleteRoom,
  addCharacteristicValue,
  updateCharacteristicValue,
  deleteCharacteristicValue,
  type RoomDetail,
  type RoomHistoryEntry,
  type CharacteristicValueType,
  type CharacteristicValue,
} from '@/lib/rooms-api'
import { fetchDefinitions, type RoomCharacteristicDefinition } from '@/lib/room-characteristic-definitions-api'

const route = useRoute()
const router = useRouter()
const id = computed(() => Number(route.params.id))

const detail = ref<RoomDetail | null>(null)
const definitions = ref<RoomCharacteristicDefinition[]>([])
const isLoading = ref(true)
const notFound = ref(false)

async function load() {
  try {
    detail.value = await fetchRoomDetail(id.value)
  } catch {
    notFound.value = true
  } finally {
    isLoading.value = false
  }
}

onMounted(async () => {
  await Promise.all([load(), fetchDefinitions().then((d) => (definitions.value = d))])
})

function formatDate(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
}

function toDateInputValue(iso: string): string {
  return iso.slice(0, 10)
}

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatValue(entry: { valueType: CharacteristicValueType; value: CharacteristicValue; unit: string | null }): string {
  if (entry.value === null || entry.value === undefined) return '—'
  if (entry.valueType === 'BOOLEAN') return entry.value ? 'Да' : 'Нет'
  return entry.unit ? `${entry.value} ${entry.unit}` : String(entry.value)
}

// --- Редактирование номера комнаты ---
const isEditRoomOpen = ref(false)
const editRoomNumber = ref('')
const editRoomError = ref('')
const isSavingRoom = ref(false)

function openEditRoom() {
  editRoomNumber.value = detail.value?.room ?? ''
  editRoomError.value = ''
  isEditRoomOpen.value = true
}

async function submitEditRoom() {
  if (!detail.value || !editRoomNumber.value.trim()) return
  isSavingRoom.value = true
  editRoomError.value = ''
  try {
    await updateRoom(detail.value.id, editRoomNumber.value.trim())
    await load()
    isEditRoomOpen.value = false
  } catch (error) {
    editRoomError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isSavingRoom.value = false
  }
}

// --- Удаление комнаты ---
const isDeleteRoomOpen = ref(false)
const isDeletingRoom = ref(false)
const deleteRoomError = ref('')

async function confirmDeleteRoom() {
  if (!detail.value) return
  isDeletingRoom.value = true
  deleteRoomError.value = ''
  try {
    await deleteRoom(detail.value.id)
    router.push('/rooms')
  } catch (error) {
    deleteRoomError.value = error instanceof Error ? error.message : String(error)
    isDeletingRoom.value = false
  }
}

// --- Добавление/редактирование значения характеристики ---
const isValueDialogOpen = ref(false)
const valueDialogMode = ref<'add' | 'edit'>('add')
const valueDialogDefinitionId = ref<number | null>(null)
const valueDialogEditingId = ref<number | null>(null)
const valueDialogPeriod = ref('')
const valueDialogBoolValue = ref(false)
const valueDialogNumberValue = ref('')
const valueDialogTextValue = ref('')
const valueDialogError = ref('')
const isSavingValue = ref(false)
const historyError = ref('')
const deletingValueId = ref<number | null>(null)

const selectedDefinition = computed(() => definitions.value.find((d) => d.id === valueDialogDefinitionId.value) ?? null)

function openAddValue() {
  valueDialogMode.value = 'add'
  valueDialogDefinitionId.value = definitions.value[0]?.id ?? null
  valueDialogEditingId.value = null
  valueDialogPeriod.value = todayInputValue()
  valueDialogBoolValue.value = false
  valueDialogNumberValue.value = ''
  valueDialogTextValue.value = ''
  valueDialogError.value = ''
  isValueDialogOpen.value = true
}

function openEditValue(entry: RoomHistoryEntry) {
  valueDialogMode.value = 'edit'
  valueDialogDefinitionId.value = entry.definitionId
  valueDialogEditingId.value = entry.id
  valueDialogPeriod.value = toDateInputValue(entry.period)
  valueDialogBoolValue.value = entry.valueType === 'BOOLEAN' ? Boolean(entry.value) : false
  valueDialogNumberValue.value = entry.valueType === 'NUMBER' && entry.value !== null ? String(entry.value) : ''
  valueDialogTextValue.value = entry.valueType === 'TEXT' && entry.value !== null ? String(entry.value) : ''
  valueDialogError.value = ''
  isValueDialogOpen.value = true
}

function buildValue(): boolean | number | string | null {
  const type = selectedDefinition.value?.valueType
  if (type === 'BOOLEAN') return valueDialogBoolValue.value
  if (type === 'NUMBER') {
    const num = Number(valueDialogNumberValue.value)
    return Number.isFinite(num) && valueDialogNumberValue.value.trim() !== '' ? num : null
  }
  if (type === 'TEXT') return valueDialogTextValue.value.trim() || null
  return null
}

async function submitValueDialog() {
  if (!detail.value || !selectedDefinition.value) return
  const value = buildValue()
  if (value === null) {
    valueDialogError.value = 'Заполните значение'
    return
  }
  if (!valueDialogPeriod.value) {
    valueDialogError.value = 'Укажите дату'
    return
  }
  isSavingValue.value = true
  valueDialogError.value = ''
  try {
    if (valueDialogMode.value === 'add') {
      await addCharacteristicValue(detail.value.id, {
        definitionId: selectedDefinition.value.id,
        period: valueDialogPeriod.value,
        value,
      })
    } else if (valueDialogEditingId.value !== null) {
      await updateCharacteristicValue(detail.value.id, valueDialogEditingId.value, {
        period: valueDialogPeriod.value,
        value,
      })
    }
    await load()
    isValueDialogOpen.value = false
  } catch (error) {
    valueDialogError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isSavingValue.value = false
  }
}

async function removeValue(entry: RoomHistoryEntry) {
  if (!detail.value) return
  deletingValueId.value = entry.id
  historyError.value = ''
  try {
    await deleteCharacteristicValue(detail.value.id, entry.id)
    await load()
  } catch (error) {
    historyError.value = error instanceof Error ? error.message : String(error)
  } finally {
    deletingValueId.value = null
  }
}
</script>

<template>
  <div class="flex flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-7" as-child>
        <RouterLink to="/rooms">
          <ArrowLeft class="text-primary" />
          <span class="sr-only">К комнатам</span>
        </RouterLink>
      </Button>
      <h1 class="text-lg font-medium">Информация о комнате</h1>
    </div>

    <p v-if="isLoading" class="text-sm text-muted-foreground">Загрузка…</p>
    <p v-else-if="notFound" class="text-sm text-red-500">Комната не найдена</p>

    <template v-else-if="detail">
      <Card class="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex items-center gap-3">
          <div class="text-xl font-semibold">Комната {{ detail.room }}</div>
          <span v-if="detail.floor !== null" class="text-sm text-muted-foreground">{{ detail.floor }} этаж</span>
          <Button variant="ghost" size="icon" class="size-7" @click="openEditRoom">
            <Pencil class="text-primary" />
            <span class="sr-only">Изменить номер</span>
          </Button>
        </div>
        <Button variant="outline" size="sm" class="text-red-500 hover:text-red-500" @click="isDeleteRoomOpen = true">
          <Trash2 />
          Удалить комнату
        </Button>
      </Card>

      <div class="flex items-center justify-between">
        <div class="text-lg font-medium">Характеристики</div>
        <Button size="sm" :disabled="!definitions.length" @click="openAddValue">
          <Plus />
          Добавить значение
        </Button>
      </div>

      <Card class="p-6">
        <p v-if="!detail.characteristics.length" class="text-sm text-muted-foreground">Нет данных</p>
        <div v-else class="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="c in detail.characteristics"
            :key="c.definitionId"
            class="flex items-center justify-between gap-2 border-b py-2 text-sm last:border-b-0"
          >
            <span class="text-muted-foreground">{{ c.name }}</span>
            <span class="font-medium">{{ formatValue(c) }}</span>
          </div>
        </div>
      </Card>

      <div class="text-lg font-medium">История значений</div>
      <p v-if="historyError" class="text-sm text-red-500">{{ historyError }}</p>

      <Card class="p-6">
        <p v-if="!detail.history.length" class="text-sm text-muted-foreground">Нет данных</p>
        <Table v-else class="table-fixed">
          <TableHeader class="bg-muted">
            <TableRow>
              <TableHead class="w-[30%]">Характеристика</TableHead>
              <TableHead class="w-[25%]">Значение</TableHead>
              <TableHead class="w-[20%]">Период</TableHead>
              <TableHead class="w-[25%]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="entry in detail.history" :key="entry.id">
              <TableCell>{{ entry.name }}</TableCell>
              <TableCell>{{ formatValue(entry) }}</TableCell>
              <TableCell>{{ formatDate(entry.period) }}</TableCell>
              <TableCell class="flex items-center justify-end gap-1">
                <Button variant="ghost" size="icon" class="size-7" @click="openEditValue(entry)">
                  <Pencil class="text-primary" />
                  <span class="sr-only">Изменить</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-7"
                  :disabled="deletingValueId === entry.id"
                  @click="removeValue(entry)"
                >
                  <Trash2 class="text-red-500" />
                  <span class="sr-only">Удалить</span>
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>
    </template>

    <!-- Изменение номера комнаты -->
    <Dialog :open="isEditRoomOpen" @update:open="(open) => (isEditRoomOpen = open)">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Изменить номер комнаты</DialogTitle>
        </DialogHeader>
        <div class="flex flex-col gap-2">
          <Label for="edit-room-number">Номер</Label>
          <Input id="edit-room-number" v-model="editRoomNumber" @keyup.enter="submitEditRoom" />
          <p v-if="editRoomError" class="text-sm text-red-500">{{ editRoomError }}</p>
        </div>
        <DialogFooter>
          <Button :disabled="isSavingRoom || !editRoomNumber.trim()" @click="submitEditRoom">Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Удаление комнаты -->
    <Dialog :open="isDeleteRoomOpen" @update:open="(open) => (isDeleteRoomOpen = open)">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Удалить комнату?</DialogTitle>
          <DialogDescription>Вместе с комнатой удалится вся история значений её характеристик. Действие необратимо.</DialogDescription>
        </DialogHeader>
        <p v-if="deleteRoomError" class="text-sm text-red-500">{{ deleteRoomError }}</p>
        <DialogFooter>
          <Button variant="outline" @click="isDeleteRoomOpen = false">Отмена</Button>
          <Button variant="destructive" :disabled="isDeletingRoom" @click="confirmDeleteRoom">Удалить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Добавление/редактирование значения характеристики -->
    <Dialog :open="isValueDialogOpen" @update:open="(open) => (isValueDialogOpen = open)">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ valueDialogMode === 'add' ? 'Новое значение характеристики' : 'Изменить значение' }}</DialogTitle>
        </DialogHeader>
        <div class="flex flex-col gap-4">
          <div v-if="valueDialogMode === 'add'" class="flex flex-col gap-2">
            <Label>Характеристика</Label>
            <Select :model-value="valueDialogDefinitionId ? String(valueDialogDefinitionId) : undefined" @update:model-value="(v) => (valueDialogDefinitionId = Number(v))">
              <SelectTrigger>
                <SelectValue placeholder="Выберите характеристику" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="d in definitions" :key="d.id" :value="String(d.id)">{{ d.name }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div v-else class="text-sm text-muted-foreground">{{ selectedDefinition?.name }}</div>

          <div class="flex flex-col gap-2">
            <Label for="value-period">Дата</Label>
            <Input id="value-period" v-model="valueDialogPeriod" type="date" />
          </div>

          <div class="flex flex-col gap-2">
            <Label>Значение</Label>
            <div v-if="selectedDefinition?.valueType === 'BOOLEAN'" class="flex items-center gap-2">
              <Checkbox :model-value="valueDialogBoolValue" @update:model-value="(v) => (valueDialogBoolValue = !!v)" />
              <span class="text-sm">Да</span>
            </div>
            <Input v-else-if="selectedDefinition?.valueType === 'NUMBER'" v-model="valueDialogNumberValue" type="number" step="any" />
            <Input v-else v-model="valueDialogTextValue" type="text" />
          </div>

          <p v-if="valueDialogError" class="text-sm text-red-500">{{ valueDialogError }}</p>
        </div>
        <DialogFooter>
          <Button :disabled="isSavingValue || !selectedDefinition" @click="submitValueDialog">Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
