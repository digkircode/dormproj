<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
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
import RoomCharacteristicsGrid from '@/components/RoomCharacteristicsGrid.vue'
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

const { t, locale } = useI18n()

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
const NO_SPINNER_CLASS = '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
const CORE_ORDER = ['Этаж', 'Жилое помещение', 'Количество мест', 'Площадь', 'Стоимость (из вуза)', 'Стоимость (не из вуза)']

const props = defineProps<{ roomId: number | null; showDormitoryInfo?: boolean }>()
const emit = defineEmits<{ deleted: []; changed: [] }>()

const detail = ref<RoomDetail | null>(null)
const definitions = ref<RoomCharacteristicDefinition[]>([])
const isLoading = ref(true)
const loadError = ref('')
let roomRequestVersion = 0
let dormitoryRequestVersion = 0

const addableDefinitions = computed(() =>
  definitions.value.filter((d) => !DORMITORY_INFO_FIELDS.some((f) => f.name === d.name)),
)

const dormitoryLoadError = ref('')
const isDormitoryLoading = ref(false)
const dormitoryEditValues = reactive<Record<DormitoryInfoFieldKey, string>>({
  communalServicesCost: '',
  dailyPaymentInternal: '',
  dailyPaymentOther: '',
  passRestorationCost: '',
  guestRoomDailyRate: '',
})
const dormitorySavingFields = reactive<Record<DormitoryInfoFieldKey, boolean>>({
  communalServicesCost: false,
  dailyPaymentInternal: false,
  dailyPaymentOther: false,
  passRestorationCost: false,
  guestRoomDailyRate: false,
})
const dormitorySavedFields = reactive<Record<DormitoryInfoFieldKey, boolean>>({
  communalServicesCost: false,
  dailyPaymentInternal: false,
  dailyPaymentOther: false,
  passRestorationCost: false,
  guestRoomDailyRate: false,
})
const dormitoryFieldErrors = reactive<Record<DormitoryInfoFieldKey, string>>({
  communalServicesCost: '',
  dailyPaymentInternal: '',
  dailyPaymentOther: '',
  passRestorationCost: '',
  guestRoomDailyRate: '',
})

async function loadDormitoryInfo() {
  const version = ++dormitoryRequestVersion
  isDormitoryLoading.value = true
  dormitoryLoadError.value = ''
  try {
    const info = await fetchDormitoryInfo()
    if (version !== dormitoryRequestVersion || !props.showDormitoryInfo) return
    for (const field of DORMITORY_INFO_FIELDS) {
      dormitoryEditValues[field.key] = info[field.key] === null ? '' : String(info[field.key])
    }
  } catch (error) {
    if (version !== dormitoryRequestVersion || !props.showDormitoryInfo) return
    dormitoryLoadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    if (version === dormitoryRequestVersion) isDormitoryLoading.value = false
  }
}

watch(
  () => props.showDormitoryInfo,
  (show) => {
    if (show) loadDormitoryInfo()
    else {
      dormitoryRequestVersion++
      isDormitoryLoading.value = false
    }
  },
  { immediate: true },
)

async function saveDormitoryField(field: (typeof DORMITORY_INFO_FIELDS)[number]) {
  const raw = String(dormitoryEditValues[field.key]).trim()
  let value: number | null
  if (raw === '') {
    value = null
  } else {
    const num = Number(raw)
    if (!Number.isFinite(num)) {
      dormitoryFieldErrors[field.key] = t('rooms.detail.fieldMustBeNumber', { name: t(`rooms.detail.dormitoryFields.${field.key}`) })
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

async function load(id: number) {
  const version = ++roomRequestVersion
  isLoading.value = true
  loadError.value = ''
  detail.value = null
  try {
    const [room, defs] = await Promise.all([fetchRoomDetail(id), fetchDefinitions()])
    if (version !== roomRequestVersion || props.roomId !== id || props.showDormitoryInfo) return
    detail.value = room
    definitions.value = defs
  } catch (error) {
    if (version !== roomRequestVersion || props.roomId !== id || props.showDormitoryInfo) return
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    if (version === roomRequestVersion) isLoading.value = false
  }
}

async function refresh() {
  if (!detail.value) return
  const id = detail.value.id
  const version = ++roomRequestVersion
  try {
    const room = await fetchRoomDetail(id)
    if (version === roomRequestVersion && props.roomId === id && !props.showDormitoryInfo) detail.value = room
  } catch (error) {
    if (version === roomRequestVersion && props.roomId === id && !props.showDormitoryInfo) {
      loadError.value = error instanceof Error ? error.message : String(error)
    }
  }
}

const selectedCharacteristicFilter = ref<number | null>(null)

watch(
  () => props.roomId,
  (id) => {
    selectedCharacteristicFilter.value = null
    if (id !== null) load(id)
    else {
      roomRequestVersion++
      detail.value = null
      isLoading.value = false
      loadError.value = ''
    }
  },
  { immediate: true },
)

function formatDate(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
}

function formatValue(entry: { valueType: CharacteristicValueType; value: CharacteristicValue; unit: string | null }): string {
  if (entry.value === null || entry.value === undefined) return '-'
  if (entry.valueType === 'BOOLEAN') return entry.value ? t('boolean.yes') : t('boolean.no')
  return entry.unit ? `${entry.value} ${entry.unit}` : String(entry.value)
}

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
const valueSubmitAttempted = ref(false)
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
  valueSubmitAttempted.value = false
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
  valueSubmitAttempted.value = false
  valueFormOpen.value = true
}

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
    const raw = String(valueDialogNumberValue.value).trim()
    const num = Number(raw)
    return raw !== '' && Number.isFinite(num) ? num : null
  }
  if (type === 'TEXT') return valueDialogTextValue.value.trim() || null
  return null
}

const valueMissing = computed(() => valueSubmitAttempted.value && buildValue() === null)
const periodMissing = computed(() => valueSubmitAttempted.value && !valueDialogPeriod.value)

async function submitValueForm() {
  if (isSavingValue.value || !detail.value || !selectedDefinition.value) return
  valueSubmitAttempted.value = true
  const value = buildValue()
  if (value === null || !valueDialogPeriod.value) return
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
    <div class="flex h-14 shrink-0 items-center gap-1 border-b px-4 md:px-6">
      <Transition
        mode="out-in"
        enter-active-class="animate-in fade-in-0 slide-in-from-top-1 duration-300"
        leave-active-class="animate-out fade-out-0 duration-150"
      >
        <div v-if="showDormitoryInfo" key="dormitory" class="flex items-center gap-1">
          <h2 class="text-lg font-medium">{{ t('rooms.detail.dormitoryTitle') }}</h2>
        </div>
        <div v-else-if="detail" :key="detail.id" class="flex items-center gap-1">
          <h2 class="text-lg font-medium">{{ t('roomInfo.dialogTitle', { room: detail.room }) }}</h2>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                class="size-7 shrink-0 text-red-500 hover:text-red-500"
                @click="deleteRoomConfirmOpen = true"
              >
                <Trash2 />
                <span class="sr-only">{{ t('rooms.detail.deleteRoom') }}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{{ t('rooms.detail.deleteRoom') }}</TooltipContent>
          </Tooltip>
        </div>
        <h2 v-else key="placeholder" class="text-lg font-medium text-muted-foreground">{{ t('rooms.detail.roomPlaceholder') }}</h2>
      </Transition>
    </div>

    <div class="min-h-0 flex-1">
      <Transition
        mode="out-in"
        enter-active-class="animate-in fade-in-0 duration-200"
        leave-active-class="animate-out fade-out-0 duration-150"
      >
        <div v-if="showDormitoryInfo" key="dormitory-info" class="flex h-full flex-col gap-4 p-4 md:p-6">
          <div class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Building2 class="size-4 text-primary" />
            {{ t('rooms.detail.dormitoryInfo') }}
          </div>
          <p v-if="dormitoryLoadError" class="text-sm text-red-500">{{ dormitoryLoadError }}</p>
          <div v-if="isDormitoryLoading" class="w-full max-w-md space-y-2" aria-hidden="true"><div v-for="n in 5" :key="n" class="h-10 animate-pulse rounded bg-muted motion-reduce:animate-none" /></div>
          <div v-else-if="!dormitoryLoadError" class="w-full max-w-md rounded-md border">
            <div
              v-for="(field, index) in DORMITORY_INFO_FIELDS"
              :key="field.key"
              class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 text-sm"
              :class="index > 0 ? 'border-t border-border' : ''"
            >
              <span class="min-w-0 text-muted-foreground">{{ t(`rooms.detail.dormitoryFields.${field.key}`) }}</span>
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
          <p class="text-sm">{{ t('rooms.detail.selectRoomHint') }}</p>
        </div>

        <div v-else-if="isLoading" key="loading" class="space-y-4 p-4 md:p-6" aria-hidden="true"><div class="h-8 w-1/2 animate-pulse rounded bg-muted motion-reduce:animate-none" /><div v-for="n in 6" :key="n" class="h-10 animate-pulse rounded bg-muted motion-reduce:animate-none" /></div>
        <p v-else-if="loadError" key="error" class="p-4 text-sm text-red-500">{{ loadError }}</p>

        <div v-else-if="detail" :key="detail.id" class="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
          <div class="flex shrink-0 items-center gap-2">
          <div class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <SlidersHorizontal class="size-4 text-primary" />
            {{ t('rooms.detail.characteristics') }}
          </div>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button size="icon" variant="outline" class="size-7" @click="openAddValue()">
                <Plus class="text-primary" />
                <span class="sr-only">{{ t('rooms.detail.addCharacteristic') }}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{{ t('rooms.detail.addCharacteristic') }}</TooltipContent>
          </Tooltip>
        </div>

        <RoomCharacteristicsGrid
          class="shrink-0"
          :rows="displayCharacteristics"
          interactive
          :selected-id="selectedCharacteristicFilter"
          @select="toggleCharacteristicFilter"
        />

        <div class="flex h-7 min-w-0 shrink-0 items-center gap-2">
          <div class="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-muted-foreground">
            <History class="size-4 shrink-0 text-primary" />
            <span class="truncate">{{ selectedCharacteristicName ? t('rooms.detail.historyTitleFiltered', { name: selectedCharacteristicName }) : t('rooms.detail.historyTitle') }}</span>
          </div>
          <div class="size-6 shrink-0">
            <Tooltip v-if="selectedCharacteristicFilter !== null">
              <TooltipTrigger as-child>
                <Button variant="ghost" size="icon" class="size-6" @click="selectedCharacteristicFilter = null">
                  <X class="size-3.5 text-red-500" />
                  <span class="sr-only">{{ t('rooms.detail.showFullHistory') }}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{{ t('rooms.detail.showFullHistory') }}</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <p v-if="historyError" class="shrink-0 text-sm text-red-500">{{ historyError }}</p>

        <div class="min-h-0 flex-1 overflow-y-auto rounded-md border">
          <table class="w-full table-fixed text-sm">
              <thead class="sticky top-0 z-10 bg-muted">
                <tr>
                  <th class="w-[30%] px-3 py-2 text-left font-medium">{{ t('rooms.detail.colCharacteristic') }}</th>
                  <th class="w-[25%] px-3 py-2 text-left font-medium">{{ t('rooms.detail.colValue') }}</th>
                  <th class="w-[25%] px-3 py-2 text-left font-medium">{{ t('rooms.detail.colPeriod') }}</th>
                  <th class="w-[20%] px-3 py-2" />
                </tr>
              </thead>
              <tbody :key="selectedCharacteristicFilter ?? 'all'" class="room-history-reveal">
                <tr v-for="entry in filteredHistory" :key="entry.id" class="border-t">
                  <td class="px-3 py-2">{{ entry.name }}</td>
                  <td class="px-3 py-2">{{ entry.hasValue ? formatValue(entry) : '-' }}</td>
                  <td class="px-3 py-2">{{ entry.period ? formatDate(entry.period) : '-' }}</td>
                  <td class="px-3 py-2 text-right">
                    <DropdownMenu v-if="entry.hasValue && !entry.isProtected">
                      <DropdownMenuTrigger as-child>
                        <Button variant="ghost" size="icon" class="size-7" :disabled="deletingValueId === entry.id">
                          <MoreVertical class="text-muted-foreground" />
                          <span class="sr-only">{{ t('rooms.detail.actions') }}</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem @click="openEditValue(entry)">
                          <Pencil class="text-primary" />
                          {{ t('rooms.detail.edit') }}
                        </DropdownMenuItem>
                        <DropdownMenuItem @click="openDeleteValueConfirm(entry)">
                          <Trash2 class="text-red-500" />
                          {{ t('rooms.detail.delete') }}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              </tbody>
          </table>
        </div>
      </div>
    </Transition>
    </div>

    <Dialog :open="deleteRoomConfirmOpen" @update:open="(v) => (deleteRoomConfirmOpen = v)">
      <DialogScrollContent :class="['flex flex-col gap-4', DIALOG_ANIMATE_CLASS]">
        <DialogHeader>
          <DialogTitle>{{ t('rooms.detail.deleteRoomDialogTitle') }}</DialogTitle>
          <DialogDescription>
            {{ t('rooms.detail.deleteRoomDialogDescription') }}
          </DialogDescription>
        </DialogHeader>
        <p v-if="deleteRoomError" class="text-sm text-red-500">{{ deleteRoomError }}</p>
        <DialogFooter>
          <Button variant="outline" @click="deleteRoomConfirmOpen = false">{{ t('rooms.detail.cancel') }}</Button>
          <Button
            variant="outline"
            class="border-red-500 text-red-500 hover:text-red-500"
            :loading="isDeletingRoom"
            @click="confirmDeleteRoom"
          >
            {{ t('rooms.detail.confirmDelete') }}
          </Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>

    <Dialog :open="valueFormOpen" @update:open="(v) => (valueFormOpen = v)">
      <DialogScrollContent :class="['flex flex-col gap-4', DIALOG_ANIMATE_CLASS]">
        <DialogHeader>
          <DialogTitle>{{ valueFormKind === 'add' ? t('rooms.detail.newValueTitle') : t('rooms.detail.editValueTitle') }}</DialogTitle>
        </DialogHeader>
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-2">
            <Label>{{ t('rooms.detail.characteristicLabel') }}</Label>
            <Select
              v-if="!valueFormLocked"
              :model-value="valueDialogDefinitionId ? String(valueDialogDefinitionId) : undefined"
              @update:model-value="(v) => onCharacteristicSelect(v as string)"
            >
              <SelectTrigger>
                <SelectValue :placeholder="t('rooms.detail.selectCharacteristicPlaceholder')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="d in addableDefinitions" :key="d.id" :value="String(d.id)">{{ d.name }}</SelectItem>
              </SelectContent>
            </Select>
            <div v-else class="text-sm text-muted-foreground">{{ selectedDefinition?.name }}</div>
          </div>

          <div class="flex flex-col gap-2">
            <Label>{{ t('rooms.detail.dateLabel') }}</Label>
            <Popover :open="isCalendarOpen" @update:open="(v) => (isCalendarOpen = v)">
              <PopoverTrigger as-child>
                <Button variant="outline" :aria-invalid="periodMissing" :class="['w-full justify-start text-left font-normal', periodMissing ? 'border-destructive' : '']">
                  <CalendarIcon class="mr-2 size-4 text-primary" />
                  {{ valueDialogPeriod ? formatDate(valueDialogPeriod) : t('rooms.detail.selectDatePlaceholder') }}
                </Button>
              </PopoverTrigger>
              <PopoverContent class="w-auto p-0">
                <Calendar :locale="locale" :model-value="calendarValue" @update:model-value="onCalendarSelect" />
              </PopoverContent>
            </Popover>
            <p v-if="periodMissing" class="text-xs text-destructive">{{ t('rooms.detail.specifyDate') }}</p>
          </div>

          <div class="flex flex-col gap-2">
            <Label>{{ t('rooms.detail.valueLabel') }}</Label>
            <div v-if="selectedDefinition?.valueType === 'BOOLEAN'" :class="['flex items-center gap-4', valueMissing ? 'rounded-md border border-destructive p-2' : '']">
              <label class="flex items-center gap-2 text-sm">
                <Checkbox
                  :model-value="valueDialogBoolValue === true"
                  @update:model-value="(v) => { if (v) valueDialogBoolValue = true }"
                />
                {{ t('boolean.yes') }}
              </label>
              <label class="flex items-center gap-2 text-sm">
                <Checkbox
                  :model-value="valueDialogBoolValue === false"
                  @update:model-value="(v) => { if (v) valueDialogBoolValue = false }"
                />
                {{ t('boolean.no') }}
              </label>
            </div>
            <input
              v-else-if="selectedDefinition?.valueType === 'NUMBER'"
              v-model="valueDialogNumberValue"
              type="number"
              step="any"
              :aria-invalid="valueMissing"
              :class="[
                'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground transition-shadow focus-visible:outline-none focus-visible:border-ring/50 focus-visible:ring-4 focus-visible:ring-ring/20 focus-visible:shadow-sm disabled:cursor-not-allowed disabled:opacity-50',
                NO_SPINNER_CLASS,
                valueMissing ? 'aria-invalid:border-destructive aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive/20' : '',
              ]"
              @keydown="blockScientificNotationKeys"
            />
            <Select
              v-else-if="selectedDefinition?.valueType === 'TEXT' && selectedDefinition.options.length > 0"
              :model-value="valueDialogTextValue || undefined"
              @update:model-value="(v) => (valueDialogTextValue = (v as string) ?? '')"
            >
              <SelectTrigger :aria-invalid="valueMissing" :class="valueMissing ? 'border-destructive focus:border-destructive focus:ring-destructive/20' : ''">
                <SelectValue :placeholder="t('rooms.detail.selectValuePlaceholder')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="option in selectedDefinition.options" :key="option" :value="option">{{ option }}</SelectItem>
              </SelectContent>
            </Select>
            <Input v-else v-model="valueDialogTextValue" type="text" :aria-invalid="valueMissing" />
            <p v-if="valueMissing" class="text-xs text-destructive">{{ t('rooms.detail.fillValue') }}</p>
          </div>

          <p v-if="valueDialogError" class="text-sm text-red-500">{{ valueDialogError }}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="valueFormOpen = false">{{ t('rooms.detail.cancel') }}</Button>
          <Button :disabled="!selectedDefinition" :loading="isSavingValue" @click="submitValueForm">{{ t('rooms.detail.save') }}</Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>

    <Dialog :open="deletingValueTarget !== null" @update:open="(v) => { if (!v) deletingValueTarget = null }">
      <DialogScrollContent :class="['flex flex-col gap-4', DIALOG_ANIMATE_CLASS]">
        <DialogHeader>
          <DialogTitle>{{ t('rooms.detail.deleteValueDialogTitle') }}</DialogTitle>
          <DialogDescription>
            {{ t('rooms.detail.deleteValueDialogDescription', { name: deletingValueTarget?.name ?? '' }) }}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="deletingValueTarget = null">{{ t('rooms.detail.cancel') }}</Button>
          <Button
            variant="outline"
            class="border-red-500 text-red-500 hover:text-red-500"
            :loading="deletingValueId !== null"
            @click="confirmDeleteValue"
          >
            {{ t('rooms.detail.confirmDelete') }}
          </Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>
  </div>
</template>
