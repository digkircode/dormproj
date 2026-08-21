<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Building2, CalendarIcon, Check, DoorOpen, History, MoreVertical, Pencil, Plus, SlidersHorizontal, Trash2, X } from 'lucide-vue-next'
import { parseDate, today, getLocalTimeZone, type DateValue } from '@internationalized/date'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogScrollContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  fetchRoomDetail,
  deleteRoom,
  addCharacteristicValue,
  updateCharacteristicValue,
  deleteCharacteristicValue,
  type RoomDetail,
  type RoomCharacteristic,
  type CharacteristicValueType,
  type CharacteristicValue,
} from '@/lib/rooms-api'
import { fetchDefinitions, type RoomCharacteristicDefinition } from '@/lib/room-characteristic-definitions-api'
import { blockScientificNotationKeys } from '@/lib/utils'
import {
  fetchDormitoryInfo,
  updateDormitoryInfo,
  DORMITORY_INFO_FIELDS,
  type DormitoryInfoFieldKey,
} from '@/lib/dormitory-info-api'

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
const NO_SPINNER_CLASS = '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
// Стартовые 5 характеристик, которые всегда показываем (даже без значения — прочерком) —
// то, что заведено миграциями и защищено от удаления (definition.isProtected), а не всё
// подряд из открытого каталога. Тот же порядок используется и для сортировки истории.
const CORE_ORDER = ['Этаж', 'Жилое помещение', 'Количество мест', 'Площадь', 'Стоимость']

const props = defineProps<{ roomId: number | null; showDormitoryInfo?: boolean }>()
const emit = defineEmits<{ deleted: []; changed: [] }>()

const detail = ref<RoomDetail | null>(null)
const definitions = ref<RoomCharacteristicDefinition[]>([])
const isLoading = ref(true)
const loadError = ref('')

// Общежитские поля (DORMITORY_INFO_FIELDS) не должны попадать в выбор при добавлении
// характеристики комнаты — они не per-room, см. компактную карточку в шаблоне ниже.
// Создать определение с таким именем и так нельзя (RoomCharacteristics.vue), но
// фильтруем здесь тоже — на случай, если оно всё же появится в каталоге (сид/1С/старые
// данные), список добавления не должен его показывать.
const addableDefinitions = computed(() =>
  definitions.value.filter((d) => !DORMITORY_INFO_FIELDS.some((f) => f.name === d.name)),
)

// --- Общежитские поля (компактная карточка при клике на корень дерева) ---
const dormitoryLoadError = ref('')
const isDormitoryLoading = ref(false)
const dormitoryEditValues = reactive<Record<DormitoryInfoFieldKey, string>>({
  communalServicesCost: '',
  dailyPaymentInternal: '',
  dailyPaymentOther: '',
})
const dormitorySavingFields = reactive<Record<DormitoryInfoFieldKey, boolean>>({
  communalServicesCost: false,
  dailyPaymentInternal: false,
  dailyPaymentOther: false,
})
const dormitorySavedFields = reactive<Record<DormitoryInfoFieldKey, boolean>>({
  communalServicesCost: false,
  dailyPaymentInternal: false,
  dailyPaymentOther: false,
})
const dormitoryFieldErrors = reactive<Record<DormitoryInfoFieldKey, string>>({
  communalServicesCost: '',
  dailyPaymentInternal: '',
  dailyPaymentOther: '',
})

async function loadDormitoryInfo() {
  isDormitoryLoading.value = true
  dormitoryLoadError.value = ''
  try {
    const info = await fetchDormitoryInfo()
    for (const field of DORMITORY_INFO_FIELDS) {
      dormitoryEditValues[field.key] = info[field.key] === null ? '' : String(info[field.key])
    }
  } catch (error) {
    dormitoryLoadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isDormitoryLoading.value = false
  }
}

// Подгружаем при каждом переходе на карточку общежития — не кешируем между визитами,
// чтобы не показать устаревшие значения, если их поменяли откуда-то ещё.
watch(
  () => props.showDormitoryInfo,
  (show) => {
    if (show) loadDormitoryInfo()
  },
  { immediate: true },
)

// Автосохранение по полю (без общей кнопки "Сохранить") — по клику на @change (срабатывает
// на blur/Enter, не на каждое нажатие клавиши). Успех — зелёная галочка на пару секунд,
// не постоянный индикатор, чтобы не путать с текущим состоянием "сохранено вообще всегда".
async function saveDormitoryField(field: (typeof DORMITORY_INFO_FIELDS)[number]) {
  // v-model на <input type="number"> сам приводит значение к number на вводе (даже без
  // модификатора .number) — dormitoryEditValues[field.key] бывает и строкой, и числом,
  // String(...) перед trim() нужен, чтобы не словить "x.trim is not a function".
  const raw = String(dormitoryEditValues[field.key]).trim()
  let value: number | null
  if (raw === '') {
    value = null
  } else {
    const num = Number(raw)
    if (!Number.isFinite(num)) {
      dormitoryFieldErrors[field.key] = `«${field.name}» — должно быть числом`
      return
    }
    value = num
  }
  dormitoryFieldErrors[field.key] = ''
  dormitorySavingFields[field.key] = true
  dormitorySavedFields[field.key] = false
  try {
    await updateDormitoryInfo({ [field.key]: value })
    dormitorySavedFields[field.key] = true
    setTimeout(() => {
      dormitorySavedFields[field.key] = false
    }, 2000)
  } catch (error) {
    dormitoryFieldErrors[field.key] = error instanceof Error ? error.message : String(error)
  } finally {
    dormitorySavingFields[field.key] = false
  }
}

function sortByCore<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => CORE_ORDER.indexOf(a.name) - CORE_ORDER.indexOf(b.name))
}

// Порядок для истории — сначала по самой характеристике (core-порядок, потом остальные
// по алфавиту), потом по дате внутри неё, чтобы записи одной характеристики не шли
// вразброс среди записей других характеристик.
function compareByCharacteristic(a: { name: string }, b: { name: string }): number {
  const ai = CORE_ORDER.indexOf(a.name)
  const bi = CORE_ORDER.indexOf(b.name)
  if (ai !== -1 || bi !== -1) {
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  }
  return a.name.localeCompare(b.name, 'ru')
}

// Первый загруз/смена комнаты — с "Загрузка…"; refresh() после правок — тихо, без
// сброса текущего содержимого, чтобы TransitionGroup плавно доанимировал разницу,
// а не мигал пустым экраном.
async function load(id: number) {
  isLoading.value = true
  loadError.value = ''
  detail.value = null
  try {
    const [room, defs] = await Promise.all([fetchRoomDetail(id), fetchDefinitions()])
    detail.value = room
    definitions.value = defs
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isLoading.value = false
  }
}

async function refresh() {
  if (!detail.value) return
  try {
    detail.value = await fetchRoomDetail(detail.value.id)
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  }
}

const selectedCharacteristicFilter = ref<number | null>(null)

watch(
  () => props.roomId,
  (id) => {
    selectedCharacteristicFilter.value = null
    if (id !== null) load(id)
    else detail.value = null
  },
  { immediate: true },
)

function formatDate(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
}

function formatValue(entry: { valueType: CharacteristicValueType; value: CharacteristicValue; unit: string | null }): string {
  if (entry.value === null || entry.value === undefined) return '—'
  if (entry.valueType === 'BOOLEAN') return entry.value ? 'Да' : 'Нет'
  return entry.unit ? `${entry.value} ${entry.unit}` : String(entry.value)
}

// Синтетическая "пустая" строка для защищённой характеристики без значения — id
// отрицательный (никогда не совпадёт с настоящим), чтобы отличать от реальной записи.
interface DisplayCharacteristic extends Omit<RoomCharacteristic, 'period'> {
  period: string | null
  hasValue: boolean
}

const displayCharacteristics = computed<DisplayCharacteristic[]>(() => {
  if (!detail.value) return []
  const byDefId = new Map(detail.value.characteristics.map((c) => [c.definitionId, c]))
  const coreDefs = sortByCore(definitions.value.filter((d) => d.isProtected))
  const coreRows: DisplayCharacteristic[] = coreDefs.map((d) => {
    const existing = byDefId.get(d.id)
    if (existing) return { ...existing, period: existing.period, hasValue: true }
    return {
      id: -d.id,
      definitionId: d.id,
      name: d.name,
      valueType: d.valueType,
      unit: d.unit,
      value: null,
      period: null,
      isProtected: false,
      hasValue: false,
    }
  })
  const customRows: DisplayCharacteristic[] = detail.value.characteristics
    .filter((c) => !definitions.value.find((d) => d.id === c.definitionId)?.isProtected)
    .map((c) => ({ ...c, hasValue: true }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  return [...coreRows, ...customRows]
})

// История пустая у только что созданной комнаты — показываем те же 5 характеристик
// прочерками вместо "Нет данных", а не молчим совсем. Итоговый порядок — сначала по
// характеристике (compareByCharacteristic), внутри неё — свежие сверху.
const displayHistory = computed<
  { id: number; definitionId: number; name: string; valueType: CharacteristicValueType; unit: string | null; period: string | null; value: CharacteristicValue; isProtected: boolean; hasValue: boolean }[]
>(() => {
  if (!detail.value) return []
  const rows = detail.value.history.length
    ? detail.value.history.map((h) => ({ ...h, hasValue: true }))
    : sortByCore(definitions.value.filter((d) => d.isProtected)).map((d) => ({
        id: -d.id,
        definitionId: d.id,
        name: d.name,
        valueType: d.valueType,
        unit: d.unit,
        period: null,
        value: null,
        isProtected: false,
        hasValue: false,
      }))
  return [...rows].sort((a, b) => {
    const byCharacteristic = compareByCharacteristic(a, b)
    if (byCharacteristic !== 0) return byCharacteristic
    if (a.period === null && b.period === null) return 0
    if (a.period === null) return 1
    if (b.period === null) return -1
    return b.period.localeCompare(a.period)
  })
})

// Клик по характеристике в сетке "Текущие" фильтрует таблицу истории ниже только
// по ней (повторный клик по той же — снимает фильтр), чтобы не листать всю историю
// комнаты в поисках одной характеристики.
function toggleCharacteristicFilter(definitionId: number) {
  selectedCharacteristicFilter.value = selectedCharacteristicFilter.value === definitionId ? null : definitionId
}
const selectedCharacteristicName = computed(
  () => displayCharacteristics.value.find((c) => c.definitionId === selectedCharacteristicFilter.value)?.name ?? null,
)
const filteredHistory = computed(() =>
  selectedCharacteristicFilter.value === null
    ? displayHistory.value
    : displayHistory.value.filter((h) => h.definitionId === selectedCharacteristicFilter.value),
)

// --- Удаление комнаты ---
const deleteRoomConfirmOpen = ref(false)
const isDeletingRoom = ref(false)
const deleteRoomError = ref('')

async function confirmDeleteRoom() {
  if (!detail.value) return
  isDeletingRoom.value = true
  deleteRoomError.value = ''
  try {
    await deleteRoom(detail.value.id)
    deleteRoomConfirmOpen.value = false
    emit('deleted')
  } catch (error) {
    deleteRoomError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isDeletingRoom.value = false
  }
}

// --- Добавление/редактирование значения характеристики ---
const valueFormOpen = ref(false)
const valueFormKind = ref<'add' | 'edit'>('add')
const valueFormLocked = ref(false)
const valueDialogDefinitionId = ref<number | null>(null)
const valueDialogEditingId = ref<number | null>(null)
const valueDialogPeriod = ref('')
const valueDialogBoolValue = ref<boolean | null>(null)
const valueDialogNumberValue = ref('')
const valueDialogTextValue = ref('')
const valueDialogError = ref('')
const isSavingValue = ref(false)
const historyError = ref('')
const deletingValueId = ref<number | null>(null)

const selectedDefinition = computed(() => definitions.value.find((d) => d.id === valueDialogDefinitionId.value) ?? null)

function todayIso(): string {
  return today(getLocalTimeZone()).toString()
}

function openAddValue(definitionId?: number) {
  valueFormKind.value = 'add'
  valueFormLocked.value = definitionId !== undefined
  valueDialogDefinitionId.value = definitionId ?? addableDefinitions.value[0]?.id ?? null
  valueDialogEditingId.value = null
  valueDialogPeriod.value = todayIso()
  valueDialogBoolValue.value = null
  valueDialogNumberValue.value = ''
  valueDialogTextValue.value = ''
  valueDialogError.value = ''
  valueFormOpen.value = true
}

function openEditValue(entry: { id: number; definitionId: number; period: string | null; valueType: CharacteristicValueType; value: CharacteristicValue }) {
  valueFormKind.value = 'edit'
  valueFormLocked.value = true
  valueDialogDefinitionId.value = entry.definitionId
  valueDialogEditingId.value = entry.id
  valueDialogPeriod.value = entry.period ? entry.period.slice(0, 10) : todayIso()
  valueDialogBoolValue.value = entry.valueType === 'BOOLEAN' ? Boolean(entry.value) : null
  valueDialogNumberValue.value = entry.valueType === 'NUMBER' && entry.value !== null ? String(entry.value) : ''
  valueDialogTextValue.value = entry.valueType === 'TEXT' && entry.value !== null ? String(entry.value) : ''
  valueDialogError.value = ''
  valueFormOpen.value = true
}

// Смена характеристики в незалоченном Select — старое значение теряет смысл (другой
// valueType), а не только визуально прячется за другим полем.
function onCharacteristicSelect(v: string) {
  valueDialogDefinitionId.value = Number(v)
  valueDialogBoolValue.value = null
  valueDialogNumberValue.value = ''
  valueDialogTextValue.value = ''
}

const calendarValue = computed<DateValue | undefined>(() =>
  valueDialogPeriod.value ? parseDate(valueDialogPeriod.value) : undefined,
)
const isCalendarOpen = ref(false)
function onCalendarSelect(value: DateValue | undefined) {
  if (value) valueDialogPeriod.value = value.toString()
  isCalendarOpen.value = false
}

function buildValue(): boolean | number | string | null {
  const type = selectedDefinition.value?.valueType
  if (type === 'BOOLEAN') return valueDialogBoolValue.value
  if (type === 'NUMBER') {
    // v-model на <input type="number"> сам приводит значение к number на вводе (даже
    // без модификатора .number) — valueDialogNumberValue.value бывает и строкой (пусто),
    // и числом, String(...) перед trim() нужен, чтобы не словить "x.trim is not a function".
    const raw = String(valueDialogNumberValue.value).trim()
    const num = Number(raw)
    return raw !== '' && Number.isFinite(num) ? num : null
  }
  if (type === 'TEXT') return valueDialogTextValue.value.trim() || null
  return null
}

async function submitValueForm() {
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
    if (valueFormKind.value === 'add') {
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
    await refresh()
    valueFormOpen.value = false
    emit('changed')
  } catch (error) {
    valueDialogError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isSavingValue.value = false
  }
}

// --- Удаление значения характеристики ---
const deletingValueTarget = ref<{ id: number; name: string } | null>(null)

function openDeleteValueConfirm(entry: { id: number; name: string }) {
  deletingValueTarget.value = entry
  historyError.value = ''
}

async function confirmDeleteValue() {
  if (!detail.value || !deletingValueTarget.value) return
  deletingValueId.value = deletingValueTarget.value.id
  historyError.value = ''
  try {
    await deleteCharacteristicValue(detail.value.id, deletingValueTarget.value.id)
    await refresh()
    // Под текущим фильтром могло не остаться ни одной записи (удалили последнее значение
    // этой характеристики) — снимаем фильтр, а не оставляем пустую таблицу без объяснения.
    if (
      selectedCharacteristicFilter.value !== null &&
      !displayHistory.value.some((h) => h.definitionId === selectedCharacteristicFilter.value)
    ) {
      selectedCharacteristicFilter.value = null
    }
    deletingValueTarget.value = null
    emit('changed')
  } catch (error) {
    historyError.value = error instanceof Error ? error.message : String(error)
    deletingValueTarget.value = null
  } finally {
    deletingValueId.value = null
  }
}
</script>

<template>
  <div class="flex h-full min-w-0 flex-col">
    <!-- Заголовок — фиксированная полоса (h-14, как хедер приложения) той же высоты и
         кегля, что и заголовок "Комнаты" в дереве слева, чтобы обе панели выглядели
         единой парой. Меняется только содержимое внутри неё, сама полоса не скачет. -->
    <div class="flex h-14 shrink-0 items-center gap-1 border-b px-4 md:px-6">
      <Transition
        mode="out-in"
        enter-active-class="animate-in fade-in-0 slide-in-from-top-1 duration-300"
        leave-active-class="animate-out fade-out-0 duration-150"
      >
        <div v-if="showDormitoryInfo" key="dormitory" class="flex items-center gap-1">
          <h2 class="text-lg font-medium">Общежитие РосНОУ</h2>
        </div>
        <div v-else-if="detail" :key="detail.id" class="flex items-center gap-1">
          <h2 class="text-lg font-medium">Комната {{ detail.room }}</h2>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                class="size-7 shrink-0 text-red-500 hover:text-red-500"
                @click="deleteRoomConfirmOpen = true"
              >
                <Trash2 />
                <span class="sr-only">Удалить комнату</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Удалить комнату</TooltipContent>
          </Tooltip>
        </div>
        <h2 v-else key="placeholder" class="text-lg font-medium text-muted-foreground">Комната</h2>
      </Transition>
    </div>

    <div class="min-h-0 flex-1">
      <Transition
        mode="out-in"
        enter-active-class="animate-in fade-in-0 duration-200"
        leave-active-class="animate-out fade-out-0 duration-150"
      >
        <!-- Компактная карточка общежитских полей — по прямой просьбе НЕ растягивается на
             всю панель (max-w-sm, высота по контенту), в отличие от карточки комнаты ниже.
             Стиль — тот же грид, что и у характеристик комнаты (border+px-3 py-2 строки,
             метка слева, значение справа): значение — сразу input, без отдельной формы и
             кнопки "Сохранить" — автосохранение по @change (blur/Enter), зелёная галочка
             на пару секунд вместо статичного индикатора состояния. -->
        <div v-if="showDormitoryInfo" key="dormitory-info" class="flex h-full flex-col gap-4 p-4 md:p-6">
          <div class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Building2 class="size-4 text-primary" />
            Информация об общежитии
          </div>
          <p v-if="dormitoryLoadError" class="text-sm text-red-500">{{ dormitoryLoadError }}</p>
          <p v-if="isDormitoryLoading" class="text-sm text-muted-foreground">Загрузка…</p>
          <!-- max-w-md (не sm) — у самых длинных названий ("Суточная оплата (Другой
               вуз.)") строка из метки+инпута+единицы+галочки не помещалась в одну строку
               и переносилась. Галочка — всегда в DOM, переключается только opacity (не
               v-if/v-else) — со свапом элементов Transition on/off рендерил оба сразу во
               время кроссфейда, отсюда и "дёргало" ширину строки. -->
          <div v-else class="w-full max-w-md overflow-hidden rounded-md border">
            <div
              v-for="(field, index) in DORMITORY_INFO_FIELDS"
              :key="field.key"
              class="flex items-center justify-between gap-2 px-3 py-2 text-sm"
              :class="index > 0 ? 'border-t border-border' : ''"
            >
              <span class="shrink-0 text-muted-foreground">{{ field.name }}</span>
              <div class="flex shrink-0 items-center gap-1.5">
                <input
                  v-model="dormitoryEditValues[field.key]"
                  type="number"
                  step="any"
                  :class="[
                    'w-24 rounded border border-input bg-transparent px-1 py-0.5 text-right text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring',
                    NO_SPINNER_CLASS,
                  ]"
                  @change="saveDormitoryField(field)"
                  @keydown="blockScientificNotationKeys"
                  @keyup.enter="($event.target as HTMLInputElement).blur()"
                />
                <span class="w-4 shrink-0 text-xs text-muted-foreground">{{ field.unit }}</span>
                <Check
                  class="size-4 shrink-0 text-green-500 transition-opacity duration-300"
                  :class="dormitorySavedFields[field.key] ? 'opacity-100' : 'opacity-0'"
                />
              </div>
            </div>
          </div>
          <p v-if="Object.values(dormitoryFieldErrors).some(Boolean)" class="text-sm text-red-500">
            {{ Object.values(dormitoryFieldErrors).find(Boolean) }}
          </p>
        </div>

        <div v-else-if="roomId === null" key="empty" class="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
          <DoorOpen class="size-8" />
          <p class="text-sm">Выберите комнату слева</p>
        </div>

        <p v-else-if="isLoading" key="loading" class="p-4 text-sm text-muted-foreground">Загрузка…</p>
        <p v-else-if="loadError" key="error" class="p-4 text-sm text-red-500">{{ loadError }}</p>

        <div v-else-if="detail" :key="detail.id" class="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
          <div class="flex shrink-0 items-center gap-2">
          <div class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <SlidersHorizontal class="size-4 text-primary" />
            Характеристики
          </div>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button size="icon" variant="outline" class="size-7" @click="openAddValue()">
                <Plus class="text-primary" />
                <span class="sr-only">Добавить характеристику</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Добавить характеристику</TooltipContent>
          </Tooltip>
        </div>

        <!-- Клик по характеристике фильтрует историю ниже только по ней, повторный клик
             снимает фильтр. Без absolute на leave — на table-элементах ниже он ломает
             раскладку, здесь для единообразия тоже без него. Полная сетка: вертикальный
             разделитель по чётности индекса (не divide-x — у CSS grid с 2 колонками
             divide-x лёг бы на случайную сторону в зависимости от потока) + горизонтальный
             между строками (border-t от второй строки, на sm — от index>=2, т.к. там 2
             колонки и первая строка — это index 0 и 1). overflow-hidden на контейнере —
             чтобы прямоугольные ячейки не вылезали за скруглённые углы рамки, p-0 — чтобы
             линии сетки доходили до самой рамки, как в таблице. -->
        <TransitionGroup
          tag="div"
          class="grid shrink-0 grid-cols-1 gap-0 overflow-hidden rounded-md border sm:grid-cols-2"
          enter-active-class="animate-in fade-in-0 duration-200"
          leave-active-class="animate-out fade-out-0 duration-200"
          move-class="transition-transform duration-200"
        >
          <div
            v-for="(c, index) in displayCharacteristics"
            :key="c.definitionId"
            class="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-accent"
            :class="[
              selectedCharacteristicFilter === c.definitionId ? 'bg-accent' : '',
              index % 2 === 1 ? 'sm:border-l sm:border-border' : '',
              index > 0 ? 'border-t border-border' : '',
              index === 1 ? 'sm:border-t-0' : '',
            ]"
            @click="toggleCharacteristicFilter(c.definitionId)"
          >
            <span class="text-muted-foreground">{{ c.name }}</span>
            <span class="font-medium">{{ c.hasValue ? formatValue(c) : '—' }}</span>
          </div>
          <!-- Нечётное количество характеристик — последняя карточка одна в своей строке,
               по прямой просьбе НЕ растягиваем её на обе колонки (пустое место остаётся
               пустым). Вместо этого невидимая ячейка во второй колонке с той же
               border-t/border-l линией, что была бы у настоящей пары — только чтобы
               разделитель всё равно доходил до правого края, а не обрывался на середине. -->
          <div
            v-if="displayCharacteristics.length % 2 === 1"
            key="grid-placeholder"
            aria-hidden="true"
            class="hidden border-t border-l border-border sm:block"
          />
        </TransitionGroup>

        <div class="flex shrink-0 items-center gap-2">
          <div class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <History class="size-4 text-primary" />
            {{ selectedCharacteristicName ? `История значений — ${selectedCharacteristicName}` : 'История значений' }}
          </div>
          <Tooltip v-if="selectedCharacteristicFilter !== null">
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                class="size-6"
                @click="selectedCharacteristicFilter = null"
              >
                <X class="size-3.5 text-red-500" />
                <span class="sr-only">Показать всю историю</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Показать всю историю</TooltipContent>
          </Tooltip>
        </div>
        <p v-if="historyError" class="shrink-0 text-sm text-red-500">{{ historyError }}</p>

        <!-- min-h-0 обязателен — иначе flex-элемент с overflow-y-auto не сжимается
             внутри родителя и скролл не работает. -->
        <div class="min-h-0 flex-1 overflow-y-auto rounded-md border">
          <!-- Смена фильтра (клик по характеристике) переключает таблицу целиком тем же
               fade-swap, что и смена комнаты выше (Transition mode="out-in", те же классы
               fade-in-0/fade-out-0 duration-200/150) — не поэлементная анимация строк.
               Ключ на фильтре пересоздаёт tbody целиком, поэтому внутри уже не нужен
               TransitionGroup — старая таблица уходит и приходит новая одним блоком. -->
          <Transition
            mode="out-in"
            enter-active-class="animate-in fade-in-0 duration-200"
            leave-active-class="animate-out fade-out-0 duration-150"
          >
            <table :key="selectedCharacteristicFilter ?? 'all'" class="w-full table-fixed text-sm">
              <thead class="sticky top-0 z-10 bg-muted">
                <tr>
                  <th class="w-[30%] px-3 py-2 text-left font-medium">Характеристика</th>
                  <th class="w-[25%] px-3 py-2 text-left font-medium">Значение</th>
                  <th class="w-[25%] px-3 py-2 text-left font-medium">Период</th>
                  <th class="w-[20%] px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                <tr v-for="entry in filteredHistory" :key="entry.id" class="border-t">
                  <td class="px-3 py-2">{{ entry.name }}</td>
                  <td class="px-3 py-2">{{ entry.hasValue ? formatValue(entry) : '—' }}</td>
                  <td class="px-3 py-2">{{ entry.period ? formatDate(entry.period) : '—' }}</td>
                  <td class="px-3 py-2 text-right">
                    <DropdownMenu v-if="entry.hasValue && !entry.isProtected">
                      <DropdownMenuTrigger as-child>
                        <Button variant="ghost" size="icon" class="size-7" :disabled="deletingValueId === entry.id">
                          <MoreVertical class="text-muted-foreground" />
                          <span class="sr-only">Действия</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem @click="openEditValue(entry)">
                          <Pencil class="text-primary" />
                          Редактировать
                        </DropdownMenuItem>
                        <DropdownMenuItem @click="openDeleteValueConfirm(entry)">
                          <Trash2 class="text-red-500" />
                          Удалить
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              </tbody>
            </table>
          </Transition>
        </div>
      </div>
    </Transition>
    </div>

    <!-- Подтверждение удаления комнаты -->
    <Dialog :open="deleteRoomConfirmOpen" @update:open="(v) => (deleteRoomConfirmOpen = v)">
      <DialogScrollContent :class="['flex flex-col gap-4', DIALOG_ANIMATE_CLASS]">
        <DialogHeader>
          <DialogTitle>Удалить комнату?</DialogTitle>
          <DialogDescription>
            Вы уверены? Вместе с комнатой удалится вся история значений её характеристик. Действие необратимо.
          </DialogDescription>
        </DialogHeader>
        <p v-if="deleteRoomError" class="text-sm text-red-500">{{ deleteRoomError }}</p>
        <DialogFooter>
          <Button variant="outline" @click="deleteRoomConfirmOpen = false">Отмена</Button>
          <Button
            variant="outline"
            class="border-red-500 text-red-500 hover:text-red-500"
            :loading="isDeletingRoom"
            @click="confirmDeleteRoom"
          >
            Да, удалить
          </Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>

    <!-- Форма значения характеристики -->
    <Dialog :open="valueFormOpen" @update:open="(v) => (valueFormOpen = v)">
      <DialogScrollContent :class="['flex flex-col gap-4', DIALOG_ANIMATE_CLASS]">
        <DialogHeader>
          <DialogTitle>{{ valueFormKind === 'add' ? 'Новое значение характеристики' : 'Изменить значение' }}</DialogTitle>
        </DialogHeader>
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-2">
            <Label>Характеристика</Label>
            <!-- Reka UI Select — вернул как было. Настоящей причиной "Сохранить ничего не
                 делает" был ReferenceError из-за порядка объявлений (см. историю), Select
                 тут ни при чём. -->
            <Select
              v-if="!valueFormLocked"
              :model-value="valueDialogDefinitionId ? String(valueDialogDefinitionId) : undefined"
              @update:model-value="(v) => onCharacteristicSelect(v as string)"
            >
              <SelectTrigger>
                <SelectValue placeholder="Выберите характеристику" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="d in addableDefinitions" :key="d.id" :value="String(d.id)">{{ d.name }}</SelectItem>
              </SelectContent>
            </Select>
            <div v-else class="text-sm text-muted-foreground">{{ selectedDefinition?.name }}</div>
          </div>

          <div class="flex flex-col gap-2">
            <Label>Дата</Label>
            <Popover :open="isCalendarOpen" @update:open="(v) => (isCalendarOpen = v)">
              <PopoverTrigger as-child>
                <Button variant="outline" class="w-full justify-start text-left font-normal">
                  <CalendarIcon class="mr-2 size-4 text-primary" />
                  {{ valueDialogPeriod ? formatDate(valueDialogPeriod) : 'Выберите дату' }}
                </Button>
              </PopoverTrigger>
              <PopoverContent class="w-auto p-0">
                <Calendar locale="ru" :model-value="calendarValue" @update:model-value="onCalendarSelect" />
              </PopoverContent>
            </Popover>
          </div>

          <div class="flex flex-col gap-2">
            <Label>Значение</Label>
            <div v-if="selectedDefinition?.valueType === 'BOOLEAN'" class="flex items-center gap-4">
              <label class="flex items-center gap-2 text-sm">
                <Checkbox
                  :model-value="valueDialogBoolValue === true"
                  @update:model-value="(v) => { if (v) valueDialogBoolValue = true }"
                />
                Да
              </label>
              <label class="flex items-center gap-2 text-sm">
                <Checkbox
                  :model-value="valueDialogBoolValue === false"
                  @update:model-value="(v) => { if (v) valueDialogBoolValue = false }"
                />
                Нет
              </label>
            </div>
            <!-- Обычный native input, не компонент Input.vue — та обёртка на type="number" не
                 ловит v-model, а с ручным :value+@input через раз глотает нажатия.
                 Классы скопированы из Input.vue вручную. -->
            <input
              v-else-if="selectedDefinition?.valueType === 'NUMBER'"
              v-model="valueDialogNumberValue"
              type="number"
              step="any"
              :class="[
                'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground transition-shadow focus-visible:outline-none focus-visible:border-ring/50 focus-visible:ring-4 focus-visible:ring-ring/20 focus-visible:shadow-sm disabled:cursor-not-allowed disabled:opacity-50',
                NO_SPINNER_CLASS,
              ]"
              @keydown="blockScientificNotationKeys"
            />
            <Input v-else v-model="valueDialogTextValue" type="text" />
          </div>

          <p v-if="valueDialogError" class="text-sm text-red-500">{{ valueDialogError }}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="valueFormOpen = false">Отмена</Button>
          <Button :disabled="!selectedDefinition" :loading="isSavingValue" @click="submitValueForm">Сохранить</Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>

    <!-- Подтверждение удаления значения -->
    <Dialog :open="deletingValueTarget !== null" @update:open="(v) => { if (!v) deletingValueTarget = null }">
      <DialogScrollContent :class="['flex flex-col gap-4', DIALOG_ANIMATE_CLASS]">
        <DialogHeader>
          <DialogTitle>Удалить значение?</DialogTitle>
          <DialogDescription>
            Вы уверены, что хотите удалить значение «{{ deletingValueTarget?.name }}»? Действие необратимо.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="deletingValueTarget = null">Отмена</Button>
          <Button
            variant="outline"
            class="border-red-500 text-red-500 hover:text-red-500"
            :loading="deletingValueId !== null"
            @click="confirmDeleteValue"
          >
            Да, удалить
          </Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>
  </div>
</template>
