<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, ChevronRight, DoorClosed, DoorOpen, FileText, Home, Layers, Percent } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ReportKpiTile from '@/components/ReportKpiTile.vue'
import { fetchOccupancy, type OccupancyReport, type OccupancyRoom } from '@/lib/reports-api'
import { goBack } from '@/lib/utils'

const router = useRouter()

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'

const report = ref<OccupancyReport | null>(null)
const isLoading = ref(true)
const loadError = ref('')

async function load() {
  isLoading.value = true
  loadError.value = ''
  try {
    report.value = await fetchOccupancy()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isLoading.value = false
  }
}

onMounted(load)

// Этажи по умолчанию свёрнуты — раскрываются по клику на заголовок, состояние держим
// по строковому ключу (номер этажа или 'none'), а не по индексу — устойчивее к перезагрузке данных.
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

// Диалог комнаты — открытость и данные разнесены по разным ref намеренно: если
// обнулять selectedRoom прямо в обработчике закрытия, v-if внутри диалога схлопывает
// содержимое мгновенно, ещё до того как доигрывает анимация исчезновения самого
// диалога (см. тот же приём с isTerminateOpen/isPaymentOpen в ContractDetail.vue —
// там данные тоже не обнуляются при закрытии, только флаг открытости).
const roomDialogOpen = ref(false)
const selectedRoom = ref<OccupancyRoom | null>(null)
function openRoom(room: OccupancyRoom) {
  selectedRoom.value = room
  roomDialogOpen.value = true
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

// Переключатель "Новый/Старый" — пока чисто визуальный, ни на выборку комнат,
// ни на запрос не влияет (добавлено по прямой просьбе, логика будет позже).
const roomsView = ref<'new' | 'old'>('new')
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/')">
        <ArrowLeft class="text-primary" />
        <span class="sr-only">Назад</span>
      </Button>
      <h1 class="text-lg font-medium">Занятость общежития</h1>
    </div>

    <p v-if="loadError" class="text-sm text-red-500">{{ loadError }}</p>
    <p v-if="isLoading" class="text-sm text-muted-foreground">Загрузка…</p>

    <template v-else-if="report">
      <Card class="grid grid-cols-4 gap-4 p-4">
        <ReportKpiTile
          :icon="Home"
          bg-class="bg-blue-100 dark:bg-blue-500/15"
          icon-class="text-blue-600 dark:text-blue-400"
          label="Всего мест"
          :value="String(report.totalPlaces)"
        />
        <ReportKpiTile
          :icon="DoorClosed"
          bg-class="bg-red-100 dark:bg-red-500/15"
          icon-class="text-red-600 dark:text-red-400"
          label="Занято"
          :value="String(report.occupied)"
        />
        <ReportKpiTile
          :icon="DoorOpen"
          bg-class="bg-emerald-100 dark:bg-emerald-500/15"
          icon-class="text-emerald-600 dark:text-emerald-400"
          label="Свободно"
          :value="String(report.free)"
        />
        <ReportKpiTile
          :icon="Percent"
          bg-class="bg-orange-100 dark:bg-orange-500/15"
          icon-class="text-orange-600 dark:text-orange-400"
          label="Загрузка"
          :value="formatPercent(report.occupancyRate)"
        />
      </Card>

      <Tabs v-model="roomsView">
        <TabsList class="w-fit">
          <TabsTrigger value="new">Новый</TabsTrigger>
          <TabsTrigger value="old">Старый</TabsTrigger>
        </TabsList>
      </Tabs>

      <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        <div v-for="floorGroup in report.floors" :key="floorKey(floorGroup.floor)" class="flex flex-col gap-2">
          <button
            type="button"
            class="flex items-center gap-1.5 rounded-md py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            @click="toggleFloor(floorGroup.floor)"
          >
            <ChevronRight class="size-3.5 transition-transform" :class="expandedFloors[floorKey(floorGroup.floor)] ? 'rotate-90' : ''" />
            <Layers class="size-4 text-primary" />
            {{ floorGroup.floor === null ? 'Без этажа' : `Этаж ${floorGroup.floor}` }}
            <span class="text-xs text-muted-foreground">({{ floorGroup.rooms.length }})</span>
          </button>
          <div v-if="expandedFloors[floorKey(floorGroup.floor)]" class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            <button
              v-for="room in floorGroup.rooms"
              :key="room.id"
              type="button"
              class="flex flex-col gap-2 rounded-md border p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent"
              @click="openRoom(room)"
            >
              <span class="flex items-center gap-1.5 text-sm font-semibold">
                <component :is="room.occupied > 0 ? DoorClosed : DoorOpen" class="size-4 shrink-0 text-primary" />
                {{ room.room }}
              </span>
              <div class="h-2 overflow-hidden rounded-full bg-muted">
                <div class="h-full rounded-full transition-all" :class="barClass(room)" :style="{ width: `${occupancyRatio(room) * 100}%` }" />
              </div>
              <span class="text-xs text-muted-foreground">({{ room.occupied }} / {{ room.free ?? '—' }})</span>
            </button>
          </div>
        </div>
      </div>
    </template>

    <Dialog :open="roomDialogOpen" @update:open="(v) => (roomDialogOpen = v)">
      <DialogScrollContent :class="['flex flex-col gap-4', DIALOG_ANIMATE_CLASS]">
        <DialogHeader>
          <DialogTitle>Комната {{ selectedRoom?.room }}</DialogTitle>
        </DialogHeader>
        <div v-if="selectedRoom" class="flex flex-col gap-3 text-sm">
          <p class="text-muted-foreground">
            Занято {{ selectedRoom.occupied }} из {{ selectedRoom.capacity ?? '—' }},
            свободно {{ selectedRoom.free ?? '—' }}
          </p>
          <ul v-if="selectedRoom.occupants.length" class="flex flex-col gap-2">
            <li v-for="o in selectedRoom.occupants" :key="o.contractId" class="flex items-center justify-between rounded-md border px-3 py-2">
              <span>{{ o.residentFullName }}</span>
              <RouterLink
                :to="{ name: 'contract-detail', params: { id: o.contractId } }"
                class="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <FileText class="size-3.5 shrink-0" />
                Договор № {{ o.contractNumber }}
              </RouterLink>
            </li>
          </ul>
          <p v-else class="text-muted-foreground">Комната свободна</p>
        </div>
      </DialogScrollContent>
    </Dialog>
  </div>
</template>
