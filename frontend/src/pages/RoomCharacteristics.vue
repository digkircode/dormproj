<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { GripVertical, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-vue-next'
import { VueDraggable } from 'vue-draggable-plus'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableHeader, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogScrollContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  fetchDefinitions,
  createDefinition,
  updateDefinition,
  deleteDefinition,
  reorderDefinitions,
  type RoomCharacteristicDefinition,
} from '@/lib/room-characteristic-definitions-api'
import { DORMITORY_INFO_FIELDS } from '@/lib/dormitory-info-api'
import type { CharacteristicValueType } from '@/lib/rooms-api'

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'

const VALUE_TYPE_LABELS: Record<CharacteristicValueType, string> = {
  BOOLEAN: 'Да/Нет',
  NUMBER: 'Число',
  TEXT: 'Текст',
}

const definitions = ref<RoomCharacteristicDefinition[]>([])
const isLoading = ref(true)
const loadError = ref('')

async function load() {
  isLoading.value = true
  loadError.value = ''
  try {
    definitions.value = await fetchDefinitions()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isLoading.value = false
  }
}

onMounted(load)

// --- Перетаскивание строк мышью (vue-draggable-plus, обёртка над SortableJS —
// плавная FLIP-анимация перестановки вместо резких прыжков нативного HTML5 DnD).
// Порядок меняется оптимистично (v-model на definitions), при ошибке сохранения
// откатывается перезагрузкой с сервера. Перетаскивать можно только за ручку
// (handle=".drag-handle"), не за всю строку — иначе конфликтует с кликом по меню действий.
const reorderError = ref('')

async function onDragEnd() {
  reorderError.value = ''
  try {
    await reorderDefinitions(definitions.value.map((d) => d.id))
  } catch (error) {
    reorderError.value = error instanceof Error ? error.message : String(error)
    await load()
  }
}

// --- Создание/редактирование ---
const isDialogOpen = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const editingId = ref<number | null>(null)
const formName = ref('')
const formValueType = ref<CharacteristicValueType>('TEXT')
const formUnit = ref('')
const dialogError = ref('')
const isSaving = ref(false)

function openCreate() {
  dialogMode.value = 'create'
  editingId.value = null
  formName.value = ''
  formValueType.value = 'TEXT'
  formUnit.value = ''
  dialogError.value = ''
  isDialogOpen.value = true
}

function openEdit(definition: RoomCharacteristicDefinition) {
  dialogMode.value = 'edit'
  editingId.value = definition.id
  formName.value = definition.name
  formValueType.value = definition.valueType
  formUnit.value = definition.unit ?? ''
  dialogError.value = ''
  isDialogOpen.value = true
}

async function submitDialog() {
  const trimmedName = formName.value.trim()
  if (!trimmedName) return
  // Эти 3 названия — учёт по общежитию в целом (см. RoomTree.vue), не per-room
  // характеристика, заводить их в этом каталоге нельзя.
  if (dialogMode.value === 'create' && DORMITORY_INFO_FIELDS.some((f) => f.name === trimmedName)) {
    dialogError.value = 'Это характеристика общежития в целом, а не комнаты — её нельзя добавить сюда'
    return
  }
  isSaving.value = true
  dialogError.value = ''
  try {
    if (dialogMode.value === 'create') {
      await createDefinition({ name: formName.value.trim(), valueType: formValueType.value, unit: formUnit.value.trim() || null })
    } else if (editingId.value !== null) {
      await updateDefinition(editingId.value, { name: formName.value.trim(), unit: formUnit.value.trim() || null })
    }
    isDialogOpen.value = false
    await load()
  } catch (error) {
    dialogError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isSaving.value = false
  }
}

// --- Удаление (с подтверждением) ---
const deleteTarget = ref<RoomCharacteristicDefinition | null>(null)
const isDeleting = ref(false)
const deleteError = ref('')

function openDeleteConfirm(definition: RoomCharacteristicDefinition) {
  deleteTarget.value = definition
  deleteError.value = ''
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  isDeleting.value = true
  deleteError.value = ''
  try {
    await deleteDefinition(deleteTarget.value.id)
    deleteTarget.value = null
    await load()
  } catch (error) {
    deleteError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isDeleting.value = false
  }
}
</script>

<template>
  <div class="flex flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center justify-between">
      <h1 class="text-lg font-medium">Характеристики комнат</h1>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button size="icon" @click="openCreate">
            <Plus />
            <span class="sr-only">Добавить характеристику</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Добавить характеристику</TooltipContent>
      </Tooltip>
    </div>

    <p v-if="loadError" class="text-sm text-red-500">{{ loadError }}</p>
    <p v-if="reorderError" class="text-sm text-red-500">{{ reorderError }}</p>
    <p v-if="deleteError" class="text-sm text-red-500">{{ deleteError }}</p>

    <Card class="min-w-0 gap-0 py-0">
      <div class="overflow-hidden rounded-lg border">
        <p v-if="isLoading" class="p-6 text-sm text-muted-foreground">Загрузка…</p>
        <p v-else-if="!definitions.length" class="p-6 text-sm text-muted-foreground">Характеристик пока нет</p>
        <Table v-else class="table-fixed">
          <TableHeader class="bg-muted">
            <TableRow>
              <TableHead class="w-8" />
              <TableHead class="w-[35%] border-r border-border">Название</TableHead>
              <TableHead class="w-[20%] border-r border-border">Тип значения</TableHead>
              <TableHead class="w-[25%]">Единица измерения</TableHead>
              <TableHead class="w-8" />
            </TableRow>
          </TableHeader>
          <!-- Без force-fallback: JS-клон вне таблицы (fallback-режим) терял colgroup-контекст
               table-layout: fixed и был источником "прыжков" ширины строки во время драга.
               Нативный HTML5 DnD этого не делает — оригинальный <tr> остаётся на месте
               (полупрозрачным через ghost-class), браузер сам рисует drag-image. -->
          <VueDraggable
            v-model="definitions"
            tag="tbody"
            class="[&_tr:last-child]:border-0"
            handle=".drag-handle"
            :animation="150"
            ghost-class="sortable-ghost"
            chosen-class="sortable-chosen"
            drag-class="sortable-drag"
            :set-data="(dataTransfer: DataTransfer) => { dataTransfer.effectAllowed = 'move' }"
            @end="onDragEnd"
          >
            <TableRow v-for="d in definitions" :key="d.id" class="select-none">
              <TableCell class="py-2 pl-2 pr-0">
                <Tooltip>
                  <TooltipTrigger as-child>
                    <span class="drag-handle flex size-6 cursor-grab items-center justify-center text-primary active:cursor-grabbing">
                      <GripVertical class="size-4" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Перетащить</TooltipContent>
                </Tooltip>
              </TableCell>
              <TableCell class="border-r border-border pl-2">{{ d.name }}</TableCell>
              <TableCell class="border-r border-border">{{ VALUE_TYPE_LABELS[d.valueType] }}</TableCell>
              <TableCell>{{ d.unit ?? '—' }}</TableCell>
              <TableCell class="py-2 pl-1 pr-3 text-right">
                <!-- Без Tooltip на самом триггере — вложенность Tooltip+DropdownMenuTrigger
                     на одной кнопке рискует тем же классом багов с зависающими Reka UI
                     порталами, что уже ловили на Select/Dialog-в-Dialog, см. CONTEXT_HANDOFF.md. -->
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <Button variant="ghost" size="icon" class="size-7">
                      <MoreVertical class="text-muted-foreground" />
                      <span class="sr-only">Действия</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem @click="openEdit(d)">
                      <Pencil class="text-primary" />
                      Редактировать
                    </DropdownMenuItem>
                    <DropdownMenuItem :disabled="d.isProtected" @click="openDeleteConfirm(d)">
                      <Trash2 class="text-red-500" />
                      Удалить
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          </VueDraggable>
        </Table>
      </div>
    </Card>

    <Dialog :open="isDialogOpen" @update:open="(open) => (isDialogOpen = open)">
      <DialogScrollContent :class="['flex flex-col gap-4', DIALOG_ANIMATE_CLASS]">
        <DialogHeader>
          <DialogTitle>{{ dialogMode === 'create' ? 'Новая характеристика' : 'Изменить характеристику' }}</DialogTitle>
        </DialogHeader>
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-2">
            <Label for="def-name">Название</Label>
            <Input id="def-name" v-model="formName" />
          </div>
          <div class="flex flex-col gap-2">
            <Label>Тип значения</Label>
            <Select :model-value="formValueType" :disabled="dialogMode === 'edit'" @update:model-value="(v) => (formValueType = v as CharacteristicValueType)">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BOOLEAN">Да/Нет</SelectItem>
                <SelectItem value="NUMBER">Число</SelectItem>
                <SelectItem value="TEXT">Текст</SelectItem>
              </SelectContent>
            </Select>
            <p v-if="dialogMode === 'edit'" class="text-xs text-muted-foreground">Тип значения нельзя изменить после создания</p>
          </div>
          <div class="flex flex-col gap-2">
            <Label for="def-unit">Единица измерения</Label>
            <Input id="def-unit" v-model="formUnit" />
          </div>
          <p v-if="dialogError" class="text-sm text-red-500">{{ dialogError }}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="isDialogOpen = false">Отмена</Button>
          <Button :disabled="isSaving || !formName.trim()" @click="submitDialog">Сохранить</Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>

    <Dialog :open="!!deleteTarget" @update:open="(open) => { if (!open) deleteTarget = null }">
      <DialogScrollContent :class="['flex flex-col gap-4', DIALOG_ANIMATE_CLASS]">
        <DialogHeader>
          <DialogTitle>Удалить характеристику?</DialogTitle>
          <DialogDescription>
            Вы уверены, что хотите удалить «{{ deleteTarget?.name }}»? Действие необратимо.
          </DialogDescription>
        </DialogHeader>
        <p v-if="deleteError" class="text-sm text-red-500">{{ deleteError }}</p>
        <DialogFooter>
          <Button variant="outline" @click="deleteTarget = null">Отмена</Button>
          <Button variant="outline" class="border-red-500 text-red-500 hover:text-red-500" :disabled="isDeleting" @click="confirmDelete">Да, удалить</Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>
  </div>
</template>

<style scoped>
.sortable-ghost {
  opacity: 0.35;
}
.sortable-chosen {
  cursor: grabbing;
  user-select: none;
}
.sortable-drag {
  opacity: 1;
  user-select: none;
}
</style>
