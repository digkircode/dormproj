<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ArrowLeft, ChevronRight, DoorClosed, DoorOpen, FileText, Home, Layers, ListFilter, Percent, SlidersHorizontal, Users } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import ReportKpiTile from '@/components/ReportKpiTile.vue'
import RoomCharacteristicsSkeleton from '@/components/RoomCharacteristicsSkeleton.vue'
import { Skeleton } from '@/components/ui/skeleton'
import DatePickerField from '@/components/DatePickerField.vue'
import { fetchOccupancy, type OccupancyReport, type OccupancyRoom } from '@/lib/reports-api'
import { fetchRoomDetail, type RoomCharacteristic, type RoomDetail } from '@/lib/rooms-api'
import { goBack } from '@/lib/utils'
import { todayIso } from '@/lib/format-locale'

const router = useRouter()
const { t } = useI18n()

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
const CORE_ORDER = ['Этаж', 'Жилое помещение', 'Количество мест', 'Площадь', 'Стоимость (из вуза)', 'Стоимость (не из вуза)']

const report = ref<OccupancyReport | null>(null)
const asOf = ref(todayIso())
const isLoading = ref(true)
const loadError = ref('')
let loadVersion = 0

async function load() {
  const version = ++loadVersion
  isLoading.value = true
  loadError.value = ''
  try {
    const result = await fetchOccupancy(asOf.value)
    if (version === loadVersion) report.value = result
  } catch (error) {
    if (version === loadVersion) loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    if (version === loadVersion) isLoading.value = false
  }
}

onMounted(load)
watch(asOf, (value) => {
  if (!value) {
    asOf.value = todayIso()
    return
  }
  void load()
})

const occupancyFilter = ref<'all' | 'free' | 'occupied'>('all')
function roomMatchesFilter(room: OccupancyRoom): boolean {
  if (occupancyFilter.value === 'all') return true
  if (room.free === null) return false
  return occupancyFilter.value === 'free' ? room.free > 0 : room.free === 0
}
const filteredFloors = computed(() => {
  if (!report.value) return []
  return report.value.floors
    .map((group) => ({ floor: group.floor, rooms: group.rooms.filter(roomMatchesFilter) }))
    .filter((group) => group.rooms.length > 0)
})

const expandedFloors = reactive<Record<string, boolean>>({})
function floorKey(floor: number | null): string {
  return floor === null ? 'none' : String(floor)
}
function toggleFloor(floor: number | null) {
  const key = floorKey(floor)
  expandedFloors[key] = !expandedFloors[key]
}

function occupancyRatio(room: OccupancyRoom): number {
  if (!room.capacity || room.capacity <= 0) return room.occupied > 0 ? 1 : 0
  return Math.min(1, room.occupied / room.capacity)
}
function barClass(room: OccupancyRoom): string {
  const ratio = occupancyRatio(room)
  if (ratio <= 0) return 'bg-transparent'
  if (ratio < 1) return 'bg-blue-500'
  return 'bg-emerald-500'
}

const roomDialogOpen = ref(false)
const selectedRoom = ref<OccupancyRoom | null>(null)

const roomDetail = ref<RoomDetail | null>(null)
const roomDetailLoading = ref(false)
const roomDetailError = ref('')
const loadingRoomId = ref<number | null>(null)
let roomRequest = 0
const roomCharacteristicsAtDate = computed<RoomCharacteristic[]>(() => {
  if (!roomDetail.value) return []
  const latest = new Map<number, RoomCharacteristic>()
  for (const entry of roomDetail.value.history) {
    if (entry.period.slice(0, 10) > asOf.value) continue
    const previous = latest.get(entry.definitionId)
    if (!previous || entry.period > previous.period) latest.set(entry.definitionId, entry)
  }
  return [...latest.values()]
})

watch(asOf, () => {
  roomRequest++
  roomDialogOpen.value = false
})

async function openRoom(room: OccupancyRoom) {
  const request = ++roomRequest
  selectedRoom.value = room
  roomDialogOpen.value = true
  loadingRoomId.value = room.id
  roomDetailLoading.value = true
  roomDetailError.value = ''
  roomDetail.value = null
  try {
    const result = await fetchRoomDetail(room.id)
    if (request === roomRequest && roomDialogOpen.value && selectedRoom.value?.id === room.id) roomDetail.value = result
  } catch (error) {
    if (request === roomRequest && roomDialogOpen.value) roomDetailError.value = error instanceof Error ? error.message : String(error)
  } finally {
    if (request === roomRequest) {
      if (roomDialogOpen.value) roomDetailLoading.value = false
      loadingRoomId.value = null
    }
  }
}
function formatCharacteristicValue(entry: { valueType: string; value: boolean | number | string | null; unit: string | null }): string {
  if (entry.value === null || entry.value === undefined) return '-'
  if (entry.valueType === 'BOOLEAN') return entry.value ? t('boolean.yes') : t('boolean.no')
  return entry.unit ? `${entry.value} ${entry.unit}` : String(entry.value)
}
function sortedCharacteristics(list: RoomDetail['characteristics']) {
  return [...list].sort((a, b) => {
    const ai = CORE_ORDER.indexOf(a.name)
    const bi = CORE_ORDER.indexOf(b.name)
    if (ai !== -1 || bi !== -1) {
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    }
    return a.name.localeCompare(b.name, 'ru')
  })
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

const roomsView = ref<'new' | 'old' | 'all'>('all')
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/')">
          <ArrowLeft class="text-primary" />
          <span class="sr-only">{{ t('reports.common.back') }}</span>
        </Button>
        <h1 class="text-lg font-medium">{{ t('reports.occupancy.title') }}</h1>
      </div>
      <div class="flex items-center gap-2">
        <span class="whitespace-nowrap text-sm text-muted-foreground">{{ t('reports.common.asOf') }}</span>
        <DatePickerField v-model="asOf" />
      </div>
    </div>

    <p v-if="loadError" class="text-sm text-red-500">{{ loadError }}</p>
    <div v-if="isLoading" class="flex min-h-[60vh] flex-col gap-4" role="status" :aria-label="t('entityTable.loading')">
      <Card class="grid grid-cols-2 gap-4 p-4 lg:grid-cols-4" aria-hidden="true">
        <div v-for="item in 4" :key="item" class="space-y-3"><Skeleton class="h-4 w-24" /><Skeleton class="h-8 w-20" /></div>
      </Card>
      <Skeleton class="h-9 w-64" aria-hidden="true" />
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6" aria-hidden="true">
        <div v-for="room in 12" :key="room" class="space-y-3 rounded-md border p-3">
          <Skeleton class="h-4 w-1/2" /><Skeleton class="h-2 w-full" /><Skeleton class="h-3 w-2/3" />
        </div>
      </div>
      <span class="sr-only">{{ t('entityTable.loading') }}</span>
    </div>

    <template v-else-if="report">
      <Card class="data-reveal grid grid-cols-4 gap-4 p-4">
        <ReportKpiTile
          :icon="Home"
          bg-class="bg-blue-100 dark:bg-blue-500/15"
          icon-class="text-blue-600 dark:text-blue-400"
          :label="t('reports.occupancy.kpiTotalPlaces')"
          :value="String(report.totalPlaces)"
        />
        <ReportKpiTile
          :icon="DoorClosed"
          bg-class="bg-red-100 dark:bg-red-500/15"
          icon-class="text-red-600 dark:text-red-400"
          :label="t('reports.occupancy.kpiOccupied')"
          :value="String(report.occupied)"
        />
        <ReportKpiTile
          :icon="DoorOpen"
          bg-class="bg-emerald-100 dark:bg-emerald-500/15"
          icon-class="text-emerald-600 dark:text-emerald-400"
          :label="t('reports.occupancy.kpiFree')"
          :value="String(report.free)"
        />
        <ReportKpiTile
          :icon="Percent"
          bg-class="bg-orange-100 dark:bg-orange-500/15"
          icon-class="text-orange-600 dark:text-orange-400"
          :label="t('reports.occupancy.kpiLoad')"
          :value="formatPercent(report.occupancyRate)"
        />
      </Card>

      <div class="flex items-center gap-2">
        <Tabs v-model="roomsView">
          <TabsList class="w-fit">
            <TabsTrigger value="all">{{ t('reports.occupancy.tabAll') }}</TabsTrigger>
            <TabsTrigger value="new">{{ t('reports.occupancy.tabNew') }}</TabsTrigger>
            <TabsTrigger value="old">{{ t('reports.occupancy.tabOld') }}</TabsTrigger>
          </TabsList>
        </Tabs>

        <div class="group relative">
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="outline" size="icon">
                <ListFilter class="text-primary" />
                <span class="sr-only">{{ t('reports.occupancy.filterTooltip') }}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-48">
              <DropdownMenuRadioGroup v-model="occupancyFilter">
                <DropdownMenuRadioItem value="all">{{ t('reports.occupancy.filterAll') }}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="free">{{ t('reports.occupancy.filterFree') }}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="occupied">{{ t('reports.occupancy.filterOccupied') }}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <span aria-hidden="true" class="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100">{{ t('reports.occupancy.filterTooltip') }}</span>
        </div>
      </div>

      <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        <div v-for="floorGroup in filteredFloors" :key="floorKey(floorGroup.floor)" class="flex flex-col gap-2">
          <button
            type="button"
            class="flex items-center gap-1.5 rounded-md py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            @click="toggleFloor(floorGroup.floor)"
          >
            <ChevronRight class="size-3.5 transition-transform" :class="expandedFloors[floorKey(floorGroup.floor)] ? 'rotate-90' : ''" />
            <Layers class="size-4 text-primary" />
            {{ floorGroup.floor === null ? t('reports.occupancy.noFloor') : t('reports.occupancy.floorLabel', { floor: floorGroup.floor }) }}
            <span class="text-xs text-muted-foreground">({{ floorGroup.rooms.length }})</span>
          </button>
          <div v-if="expandedFloors[floorKey(floorGroup.floor)]" class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            <button
              v-for="room in floorGroup.rooms"
              :key="room.id"
              type="button"
              class="flex flex-col gap-2 rounded-md border p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent disabled:pointer-events-none disabled:opacity-60"
              :disabled="loadingRoomId === room.id"
              @click="openRoom(room)"
            >
              <span class="flex items-center gap-1.5 text-sm font-semibold">
                <component :is="room.occupied > 0 ? DoorClosed : DoorOpen" class="size-4 shrink-0 text-primary" />
                {{ room.room }}
              </span>
              <div class="h-2 overflow-hidden rounded-full bg-border">
                <div class="h-full rounded-full transition-all" :class="barClass(room)" :style="{ width: `${occupancyRatio(room) * 100}%` }" />
              </div>
              <span class="text-xs text-muted-foreground">({{ room.occupied }} / {{ room.capacity ?? '-' }})</span>
            </button>
          </div>
        </div>
      </div>
    </template>

    <Dialog :open="roomDialogOpen" @update:open="(v) => (roomDialogOpen = v)">
      <DialogScrollContent :class="['flex max-h-[80dvh] flex-col gap-4', DIALOG_ANIMATE_CLASS]">
        <DialogHeader>
          <DialogTitle>{{ t('roomInfo.dialogTitle', { room: selectedRoom?.room }) }}</DialogTitle>
        </DialogHeader>
        <div v-if="selectedRoom" class="flex flex-col gap-4 text-sm">
          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <Users class="size-4 text-primary" />
              {{ t('reports.occupancy.occupants') }}
            </div>
            <ul v-if="selectedRoom.occupants.length" class="flex flex-col gap-2">
              <li v-for="o in selectedRoom.occupants" :key="o.contractId" class="flex items-center justify-between rounded-md border px-3 py-2">
                <span>{{ o.residentFullName }}</span>
                <RouterLink
                  :to="{ name: 'contract-detail', params: { id: o.contractId } }"
                  class="flex items-center gap-1 text-xs text-primary"
                >
                  <FileText class="size-3.5 shrink-0" />
                  {{ t('contracts.detail.titleWithNumber', { number: o.contractNumber }) }}
                </RouterLink>
              </li>
            </ul>
            <p v-else class="text-muted-foreground">{{ t('reports.occupancy.roomFree') }}</p>
          </div>

          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <SlidersHorizontal class="size-4 text-primary" />
              {{ t('reports.occupancy.characteristics') }}
            </div>
            <p v-if="roomDetailError" class="text-sm text-red-500">{{ roomDetailError }}</p>
            <RoomCharacteristicsSkeleton v-else-if="roomDetailLoading" />
            <div v-else-if="roomDetail" class="grid grid-cols-1 gap-0 overflow-hidden rounded-md border sm:grid-cols-2">
              <div
                v-for="(c, index) in sortedCharacteristics(roomCharacteristicsAtDate)"
                :key="c.id"
                class="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                :class="[
                  index % 2 === 1 ? 'sm:border-l sm:border-border' : '',
                  index > 0 ? 'border-t border-border' : '',
                  index === 1 ? 'sm:border-t-0' : '',
                ]"
              >
                <span class="text-muted-foreground">{{ c.name }}</span>
                <span class="font-medium">{{ formatCharacteristicValue(c) }}</span>
              </div>
              <div
                v-if="sortedCharacteristics(roomCharacteristicsAtDate).length % 2 === 1"
                aria-hidden="true"
                class="hidden border-l border-t border-border sm:block"
              />
            </div>
          </div>
        </div>
      </DialogScrollContent>
    </Dialog>
  </div>
</template>
