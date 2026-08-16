<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Pencil, Plus, Trash2 } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Dialog, DialogScrollContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  fetchDefinitions,
  createDefinition,
  updateDefinition,
  deleteDefinition,
  type RoomCharacteristicDefinition,
} from '@/lib/room-characteristic-definitions-api'
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
  if (!formName.value.trim()) return
  isSaving.value = true
  dialogError.value = ''
  try {
    if (dialogMode.value === 'create') {
      await createDefinition({ name: formName.value.trim(), valueType: formValueType.value, unit: formUnit.value.trim() || null })
    } else if (editingId.value !== null) {
      await updateDefinition(editingId.value, { name: formName.value.trim(), unit: formUnit.value.trim() || null })
    }
    await load()
    isDialogOpen.value = false
  } catch (error) {
    dialogError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isSaving.value = false
  }
}

// --- Удаление ---
const deletingId = ref<number | null>(null)
const deleteError = ref('')

async function remove(definition: RoomCharacteristicDefinition) {
  deletingId.value = definition.id
  deleteError.value = ''
  try {
    await deleteDefinition(definition.id)
    await load()
  } catch (error) {
    deleteError.value = error instanceof Error ? error.message : String(error)
  } finally {
    deletingId.value = null
  }
}
</script>

<template>
  <div class="flex flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center justify-between">
      <h1 class="text-lg font-medium">Характеристики комнат</h1>
      <Button size="sm" @click="openCreate">
        <Plus />
        Добавить характеристику
      </Button>
    </div>

    <p v-if="loadError" class="text-sm text-red-500">{{ loadError }}</p>
    <p v-if="deleteError" class="text-sm text-red-500">{{ deleteError }}</p>

    <Card class="p-6">
      <p v-if="isLoading" class="text-sm text-muted-foreground">Загрузка…</p>
      <p v-else-if="!definitions.length" class="text-sm text-muted-foreground">Характеристик пока нет</p>
      <Table v-else class="table-fixed">
        <TableHeader class="bg-muted">
          <TableRow>
            <TableHead class="w-[35%]">Название</TableHead>
            <TableHead class="w-[20%]">Тип значения</TableHead>
            <TableHead class="w-[20%]">Единица измерения</TableHead>
            <TableHead class="w-[25%]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="d in definitions" :key="d.id">
            <TableCell>{{ d.name }}</TableCell>
            <TableCell>{{ VALUE_TYPE_LABELS[d.valueType] }}</TableCell>
            <TableCell>{{ d.unit ?? '—' }}</TableCell>
            <TableCell class="flex items-center justify-end gap-1">
              <Button variant="ghost" size="icon" class="size-7" @click="openEdit(d)">
                <Pencil class="text-primary" />
                <span class="sr-only">Изменить</span>
              </Button>
              <Tooltip v-if="d.isProtected">
                <TooltipTrigger as-child>
                  <Button variant="ghost" size="icon" class="size-7" disabled>
                    <Trash2 class="text-muted-foreground" />
                    <span class="sr-only">Удалить</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Эту характеристику нельзя удалить</TooltipContent>
              </Tooltip>
              <Button v-else variant="ghost" size="icon" class="size-7" :disabled="deletingId === d.id" @click="remove(d)">
                <Trash2 class="text-red-500" />
                <span class="sr-only">Удалить</span>
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Card>

    <Dialog :open="isDialogOpen" @update:open="(open) => (isDialogOpen = open)">
      <DialogScrollContent :class="['flex flex-col gap-4', DIALOG_ANIMATE_CLASS]">
        <DialogHeader>
          <DialogTitle>{{ dialogMode === 'create' ? 'Новая характеристика' : 'Изменить характеристику' }}</DialogTitle>
        </DialogHeader>
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-2">
            <Label for="def-name">Название</Label>
            <Input id="def-name" v-model="formName" placeholder="Санузел" />
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
            <Input id="def-unit" v-model="formUnit" placeholder="м², ₽…" />
          </div>
          <p v-if="dialogError" class="text-sm text-red-500">{{ dialogError }}</p>
        </div>
        <DialogFooter>
          <Button :disabled="isSaving || !formName.trim()" @click="submitDialog">Сохранить</Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>
  </div>
</template>
