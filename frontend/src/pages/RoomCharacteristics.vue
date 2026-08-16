<script setup lang="ts">
import { provide, ref } from 'vue'
import { Plus } from 'lucide-vue-next'
import EntityTable from '@/components/EntityTable.vue'
import RoomCharacteristicActionsCell from '@/components/RoomCharacteristicActionsCell.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogScrollContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createAppColumnHelper } from '@/lib/table'
import {
  fetchDefinitionsPage,
  fetchDefinitionFacets,
  createDefinition,
  updateDefinition,
  deleteDefinition,
  type RoomCharacteristicDefinition,
} from '@/lib/room-characteristic-definitions-api'
import { DEFINITION_ACTIONS_KEY } from '@/lib/definition-actions-key'
import type { CharacteristicValueType } from '@/lib/rooms-api'

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'

const VALUE_TYPE_LABELS: Record<CharacteristicValueType, string> = {
  BOOLEAN: 'Да/Нет',
  NUMBER: 'Число',
  TEXT: 'Текст',
}

const columnLabels: Record<string, string> = {
  name: 'Название',
  valueType: 'Тип значения',
  unit: 'Единица измерения',
  actions: '',
}
const filterableFields = ['valueType']

function cellText(columnId: string, value: unknown): string {
  if (columnId === 'valueType') return VALUE_TYPE_LABELS[value as CharacteristicValueType] ?? String(value)
  if (columnId === 'unit') return (value as string | null) || '—'
  return String(value ?? '')
}

const columnHelper = createAppColumnHelper<RoomCharacteristicDefinition>()

const columns = columnHelper.columns([
  columnHelper.accessor('name', { header: columnLabels.name, enableHiding: false, size: 280, minSize: 160 }),
  columnHelper.accessor('valueType', { header: columnLabels.valueType, size: 160, minSize: 120 }),
  columnHelper.accessor('unit', { header: columnLabels.unit, size: 200, minSize: 120 }),
  columnHelper.display({ id: 'actions', header: columnLabels.actions, size: 120, minSize: 96, enableSorting: false, enableHiding: false }),
])

const cellRenderers = { actions: RoomCharacteristicActionsCell }

const table = ref<{ refresh: () => void | Promise<void> } | null>(null)

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
    isDialogOpen.value = false
    table.value?.refresh()
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
    table.value?.refresh()
  } catch (error) {
    deleteError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isDeleting.value = false
  }
}

provide(DEFINITION_ACTIONS_KEY, { edit: openEdit, remove: openDeleteConfirm })
</script>

<template>
  <div class="flex flex-1 flex-col gap-4 p-4 md:p-6">
    <EntityTable
      ref="table"
      :columns="columns"
      :column-labels="columnLabels"
      :filterable-fields="filterableFields"
      :default-sort="{ id: 'id', desc: false }"
      :fetch-page="fetchDefinitionsPage"
      :fetch-facet-values="fetchDefinitionFacets"
      :get-row-id="(d: RoomCharacteristicDefinition) => String(d.id)"
      total-label="характеристик"
      :cell-text="cellText"
      :cell-renderers="cellRenderers"
      storage-key="room-characteristics"
      accent-icons
    >
      <template #actions>
        <Button size="icon" title="Добавить характеристику" @click="openCreate">
          <Plus />
          <span class="sr-only">Добавить характеристику</span>
        </Button>
      </template>
    </EntityTable>

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
          <Button variant="destructive" :disabled="isDeleting" @click="confirmDelete">Да, удалить</Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>
  </div>
</template>
