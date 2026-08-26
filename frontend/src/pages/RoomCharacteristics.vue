<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ArrowLeft, GripVertical, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-vue-next'
import { VueDraggable, type DraggableEvent } from 'vue-draggable-plus'
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
import { goBack } from '@/lib/utils'

const router = useRouter()
const { t } = useI18n()

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'

const VALUE_TYPE_LABELS = computed<Record<CharacteristicValueType, string>>(() => ({
  BOOLEAN: t('rooms.definitions.valueTypeBoolean'),
  NUMBER: t('rooms.definitions.valueTypeNumber'),
  TEXT: t('rooms.definitions.valueTypeText'),
}))

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

// force-fallback обязателен — без него нативный HTML5 DnD браузера сам решает, как
// рисовать курсор/drag-image (значок "копирования", задвоенный снимок строки поверх
// ghost-плейсхолдера) — контролировать это кросс-браузерно нельзя. Но fallback-клон —
// это cloneNode() исходного <tr>, а <td> внутри него без явной inline-width рендерятся
// не по table-layout: fixed колонкам исходной таблицы, а по своему контенту — отсюда
// был "прыжок" ширины строки. Снимаем текущую ширину каждой ячейки в px на choose и
// снимаем инлайн-стиль обратно на unchoose — клон наследует те же px через cloneNode
// и колонки больше не скачут.
function freezeRowCellWidths(evt: DraggableEvent) {
  const row = evt.item as unknown as HTMLTableRowElement
  for (const cell of Array.from(row.cells)) {
    cell.style.width = `${cell.offsetWidth}px`
  }
}
function unfreezeRowCellWidths(evt: DraggableEvent) {
  const row = evt.item as unknown as HTMLTableRowElement
  for (const cell of Array.from(row.cells)) {
    cell.style.width = ''
  }
}

// Sortable (fallback-режим) двигает плавающий клон через `transform: matrix(...)`,
// где 5-й/6-й компоненты — сдвиг по X/Y от точки захвата, обновляется на каждый
// mousemove/touchmove на document. Своей listener на choose добавляем ПОСЛЕ
// внутреннего (он навешивается раньше, до эмита события choose, см. библиотеку) —
// значит наш обработчик всегда отрабатывает следующим в том же событии и может
// поверх переписать transform, обнулив X и оставив Y как есть: визуально драг
// становится строго вертикальным, без "прыжков в сторону" от неровной руки.
let verticalDragLockHandler: (() => void) | null = null

function lockDragToVertical() {
  verticalDragLockHandler = () => {
    const clone = document.querySelector<HTMLElement>('.sortable-drag')
    if (!clone?.style.transform) return
    const dy = new DOMMatrix(clone.style.transform).m42
    clone.style.transform = `matrix(1, 0, 0, 1, 0, ${dy})`
  }
  document.addEventListener('mousemove', verticalDragLockHandler)
  document.addEventListener('touchmove', verticalDragLockHandler)
}

function unlockDragVertical() {
  if (!verticalDragLockHandler) return
  document.removeEventListener('mousemove', verticalDragLockHandler)
  document.removeEventListener('touchmove', verticalDragLockHandler)
  verticalDragLockHandler = null
}

// --- Создание/редактирование ---
const isDialogOpen = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const editingId = ref<number | null>(null)
const formName = ref('')
const formValueType = ref<CharacteristicValueType>('TEXT')
const formUnit = ref('')
// Закрытый список значений (только для TEXT) — вводится через запятую, как самый
// простой вариант редактирования короткого списка (2-5 значений типа "Новый, Старый"),
// не отдельный чиповый редактор — не оправдан для такого объёма.
const formOptions = ref('')
const dialogError = ref('')
const isSaving = ref(false)

function parseOptions(raw: string): string[] {
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

function openCreate() {
  dialogMode.value = 'create'
  editingId.value = null
  formName.value = ''
  formValueType.value = 'TEXT'
  formUnit.value = ''
  formOptions.value = ''
  dialogError.value = ''
  isDialogOpen.value = true
}

function openEdit(definition: RoomCharacteristicDefinition) {
  dialogMode.value = 'edit'
  editingId.value = definition.id
  formName.value = definition.name
  formValueType.value = definition.valueType
  formUnit.value = definition.unit ?? ''
  formOptions.value = definition.options.join(', ')
  dialogError.value = ''
  isDialogOpen.value = true
}

async function submitDialog() {
  const trimmedName = formName.value.trim()
  if (!trimmedName) return
  // Эти 3 названия — учёт по общежитию в целом (см. RoomTree.vue), не per-room
  // характеристика, заводить их в этом каталоге нельзя — ни созданием, ни переименованием
  // существующей характеристики в одно из этих названий.
  if (DORMITORY_INFO_FIELDS.some((f) => f.name === trimmedName)) {
    dialogError.value = t('rooms.definitions.dormitoryFieldError')
    return
  }
  isSaving.value = true
  dialogError.value = ''
  try {
    const options = formValueType.value === 'TEXT' ? parseOptions(formOptions.value) : []
    if (dialogMode.value === 'create') {
      await createDefinition({ name: formName.value.trim(), valueType: formValueType.value, unit: formUnit.value.trim() || null, options })
    } else if (editingId.value !== null) {
      await updateDefinition(editingId.value, { name: formName.value.trim(), unit: formUnit.value.trim() || null, options })
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
      <div class="flex items-center gap-2">
        <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/')">
          <ArrowLeft class="text-primary" />
          <span class="sr-only">{{ t('rooms.definitions.back') }}</span>
        </Button>
        <h1 class="text-lg font-medium">{{ t('rooms.definitions.title') }}</h1>
      </div>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button size="icon" @click="openCreate">
            <Plus />
            <span class="sr-only">{{ t('rooms.definitions.addCharacteristic') }}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{{ t('rooms.definitions.addCharacteristic') }}</TooltipContent>
      </Tooltip>
    </div>

    <p v-if="loadError" class="text-sm text-red-500">{{ loadError }}</p>
    <p v-if="reorderError" class="text-sm text-red-500">{{ reorderError }}</p>
    <p v-if="deleteError" class="text-sm text-red-500">{{ deleteError }}</p>

    <Card class="min-w-0 gap-0 py-0">
      <!-- [transform:translateZ(0)] — не визуальный эффект (нулевой сдвиг), а способ сделать
           этот div containing block для потомков с position: fixed (по спецификации CSS —
           только у предка с transform/filter/perspective position: fixed считается уже не от
           viewport, а от него). Плавающий клон драга (force-fallback, см. ниже) — как раз
           position: fixed, поэтому вместе с overflow-hidden это визуально не даёт вынести его
           за границы таблицы вверх/вниз, куда бы ни укатилась мышь. -->
      <div class="overflow-hidden rounded-lg border [transform:translateZ(0)]">
        <p v-if="isLoading" class="p-6 text-sm text-muted-foreground">{{ t('rooms.definitions.loading') }}</p>
        <p v-else-if="!definitions.length" class="p-6 text-sm text-muted-foreground">{{ t('rooms.definitions.noneYet') }}</p>
        <div v-else class="[&>div]:max-h-[65vh]">
        <Table class="table-fixed">
          <TableHeader class="sticky top-0 z-10 bg-muted">
            <TableRow>
              <TableHead class="w-[38%] border-r border-border">{{ t('rooms.definitions.colName') }}</TableHead>
              <TableHead class="w-[20%] border-r border-border">{{ t('rooms.definitions.colValueType') }}</TableHead>
              <TableHead class="w-[24%]">{{ t('rooms.definitions.colUnit') }}</TableHead>
              <TableHead class="w-8" />
            </TableRow>
          </TableHeader>
          <VueDraggable
            v-model="definitions"
            tag="tbody"
            class="[&_tr:last-child]:border-0"
            handle=".drag-handle"
            :animation="150"
            :force-fallback="true"
            ghost-class="sortable-ghost"
            chosen-class="sortable-chosen"
            drag-class="sortable-drag"
            @choose="(evt: DraggableEvent) => { freezeRowCellWidths(evt); lockDragToVertical() }"
            @unchoose="(evt: DraggableEvent) => { unfreezeRowCellWidths(evt); unlockDragVertical() }"
            @end="onDragEnd"
          >
            <!-- Ручка и название — одна ячейка, не две с общей границей: расстояние между
                 иконкой и текстом задаёт только gap-1.5 у внутреннего flex, не зависит от
                 padding соседних table-колонок — так гарантированно "впритык", как в референсе.
                 Без Tooltip на ручке — всплывала посреди драга (курсор всё это время технически
                 "наведён" на элемент-триггер), а не только при обычном hover. Иконка
                 самообъясняющая (cursor-grab), подсказка не нужна. -->
            <TableRow v-for="d in definitions" :key="d.id" class="select-none">
              <TableCell class="border-r border-border">
                <div class="flex items-center gap-1.5">
                  <span class="drag-handle flex size-5 shrink-0 cursor-grab items-center justify-center text-primary active:cursor-grabbing">
                    <GripVertical class="size-4" />
                  </span>
                  <span>{{ d.name }}</span>
                </div>
              </TableCell>
              <TableCell class="border-r border-border">
                {{ VALUE_TYPE_LABELS[d.valueType] }}
                <span v-if="d.options.length" class="text-muted-foreground"> ({{ d.options.join(', ') }})</span>
              </TableCell>
              <TableCell>{{ d.unit ?? '—' }}</TableCell>
              <TableCell class="py-2 pl-1 pr-3 text-right">
                <!-- Без Tooltip на самом триггере — вложенность Tooltip+DropdownMenuTrigger
                     на одной кнопке рискует тем же классом багов с зависающими Reka UI
                     порталами, что уже ловили на Select/Dialog-в-Dialog, см. CONTEXT_HANDOFF.md. -->
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <Button variant="ghost" size="icon" class="size-7">
                      <MoreVertical class="text-muted-foreground" />
                      <span class="sr-only">{{ t('rooms.definitions.actions') }}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem @click="openEdit(d)">
                      <Pencil class="text-primary" />
                      {{ t('rooms.definitions.edit') }}
                    </DropdownMenuItem>
                    <DropdownMenuItem :disabled="d.isProtected" @click="openDeleteConfirm(d)">
                      <Trash2 class="text-red-500" />
                      {{ t('rooms.definitions.delete') }}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          </VueDraggable>
        </Table>
        </div>
      </div>
    </Card>

    <Dialog :open="isDialogOpen" @update:open="(open) => (isDialogOpen = open)">
      <DialogScrollContent :class="['flex flex-col gap-4', DIALOG_ANIMATE_CLASS]">
        <DialogHeader>
          <DialogTitle>{{ dialogMode === 'create' ? t('rooms.definitions.newTitle') : t('rooms.definitions.editTitle') }}</DialogTitle>
        </DialogHeader>
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-2">
            <Label for="def-name">{{ t('rooms.definitions.name') }}</Label>
            <Input id="def-name" v-model="formName" />
          </div>
          <div class="flex flex-col gap-2">
            <Label>{{ t('rooms.definitions.valueType') }}</Label>
            <Select :model-value="formValueType" :disabled="dialogMode === 'edit'" @update:model-value="(v) => (formValueType = v as CharacteristicValueType)">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BOOLEAN">{{ t('rooms.definitions.valueTypeBoolean') }}</SelectItem>
                <SelectItem value="NUMBER">{{ t('rooms.definitions.valueTypeNumber') }}</SelectItem>
                <SelectItem value="TEXT">{{ t('rooms.definitions.valueTypeText') }}</SelectItem>
              </SelectContent>
            </Select>
            <p v-if="dialogMode === 'edit'" class="text-xs text-muted-foreground">{{ t('rooms.definitions.valueTypeLocked') }}</p>
          </div>
          <div class="flex flex-col gap-2">
            <Label for="def-unit">{{ t('rooms.definitions.unit') }}</Label>
            <Input id="def-unit" v-model="formUnit" />
          </div>
          <div v-if="formValueType === 'TEXT'" class="flex flex-col gap-2">
            <Label for="def-options">{{ t('rooms.definitions.optionsLabel') }}</Label>
            <Input id="def-options" v-model="formOptions" :placeholder="t('rooms.definitions.optionsPlaceholder')" />
            <p class="text-xs text-muted-foreground">
              {{ t('rooms.definitions.optionsHint') }}
            </p>
          </div>
          <p v-if="dialogError" class="text-sm text-red-500">{{ dialogError }}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="isDialogOpen = false">{{ t('rooms.definitions.cancel') }}</Button>
          <Button :disabled="!formName.trim()" :loading="isSaving" @click="submitDialog">{{ t('rooms.definitions.save') }}</Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>

    <Dialog :open="!!deleteTarget" @update:open="(open) => { if (!open) deleteTarget = null }">
      <DialogScrollContent :class="['flex flex-col gap-4', DIALOG_ANIMATE_CLASS]">
        <DialogHeader>
          <DialogTitle>{{ t('rooms.definitions.deleteDialogTitle') }}</DialogTitle>
          <DialogDescription>
            {{ t('rooms.definitions.deleteDialogDescription', { name: deleteTarget?.name ?? '' }) }}
          </DialogDescription>
        </DialogHeader>
        <p v-if="deleteError" class="text-sm text-red-500">{{ deleteError }}</p>
        <DialogFooter>
          <Button variant="outline" @click="deleteTarget = null">{{ t('rooms.definitions.cancel') }}</Button>
          <Button variant="outline" class="border-red-500 text-red-500 hover:text-red-500" :loading="isDeleting" @click="confirmDelete">{{ t('rooms.definitions.confirmDelete') }}</Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>
  </div>
</template>

<style scoped>
/* Плейсхолдер на месте перетаскиваемой строки — пустая заглушка (только фон), не
   полупрозрачный дубль текста/значений: с dimmed-текстом рядом с плывущим за курсором
   клоном читалось как "два экземпляра строки одновременно". */
.sortable-ghost {
  background-color: var(--muted);
}
.sortable-ghost * {
  visibility: hidden;
}
.sortable-chosen {
  cursor: grabbing;
  user-select: none;
}
/* Плывущий за курсором клон — та же подсветка, что hover:bg-muted/50 у обычной строки.
   Псевдокласс :hover тут не сработает: Sortable ставит клону pointer-events: none (чтобы
   события мыши долетали до строки под ним, а не до самого клона), а без hit-test'а элемент
   не может считаться "наведённым" — фон приходится задавать явно. */
.sortable-drag {
  opacity: 1;
  user-select: none;
  background-color: var(--muted);
}
</style>
