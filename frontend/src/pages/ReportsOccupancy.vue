<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Home, DoorOpen, DoorClosed, Percent } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import ReportKpiTile from '@/components/ReportKpiTile.vue'
import { fetchOccupancy, type OccupancyReport, type OccupancyRoom } from '@/lib/reports-api'

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

const floorFilter = ref<string>('all')
const floorOptions = computed(() => (report.value?.floors ?? []).map((f) => f.floor))
const visibleFloors = computed(() => {
  if (!report.value) return []
  if (floorFilter.value === 'all') return report.value.floors
  const target = floorFilter.value === 'none' ? null : Number(floorFilter.value)
  return report.value.floors.filter((f) => f.floor === target)
})

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

const selectedRoom = ref<OccupancyRoom | null>(null)

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <h1 class="text-lg font-medium">Занятость общежития</h1>

    <p v-if="loadError" class="text-sm text-red-500">{{ loadError }}</p>
    <p v-if="isLoading" class="text-sm text-muted-foreground">Загрузка…</p>

    <template v-else-if="report">
      <Card class="grid grid-cols-4 gap-4 p-4">
        <ReportKpiTile
          :icon="Home"
          bg-class="bg-emerald-100 dark:bg-emerald-500/15"
          icon-class="text-emerald-600 dark:text-emerald-400"
          label="Всего мест"
          :value="String(report.totalPlaces)"
        />
        <ReportKpiTile
          :icon="DoorClosed"
          bg-class="bg-blue-100 dark:bg-blue-500/15"
          icon-class="text-blue-600 dark:text-blue-400"
          label="Занято"
          :value="String(report.occupied)"
        />
        <ReportKpiTile
          :icon="DoorOpen"
          bg-class="bg-violet-100 dark:bg-violet-500/15"
          icon-class="text-violet-600 dark:text-violet-400"
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

      <div class="flex items-center gap-2">
        <span class="text-sm text-muted-foreground">Этаж</span>
        <Select :model-value="floorFilter" @update:model-value="(v) => (floorFilter = String(v))">
          <SelectTrigger class="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все</SelectItem>
            <SelectItem v-for="floor in floorOptions" :key="floor ?? 'none'" :value="floor === null ? 'none' : String(floor)">
              {{ floor === null ? 'Без этажа' : `Этаж ${floor}` }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
        <div v-for="floorGroup in visibleFloors" :key="floorGroup.floor ?? 'none'" class="flex flex-col gap-2">
          <p class="text-sm font-medium text-muted-foreground">{{ floorGroup.floor === null ? 'Без этажа' : `Этаж ${floorGroup.floor}` }}</p>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            <button
              v-for="room in floorGroup.rooms"
              :key="room.id"
              type="button"
              class="flex flex-col gap-2 rounded-md border p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent"
              @click="selectedRoom = room"
            >
              <span class="text-sm font-semibold">{{ room.room }}</span>
              <div class="h-2 overflow-hidden rounded-full bg-muted">
                <div class="h-full rounded-full transition-all" :class="barClass(room)" :style="{ width: `${occupancyRatio(room) * 100}%` }" />
              </div>
              <span class="text-xs text-muted-foreground">{{ room.occupied }} / {{ room.capacity ?? '—' }}</span>
            </button>
          </div>
        </div>
      </div>
    </template>

    <Dialog :open="selectedRoom !== null" @update:open="(v) => { if (!v) selectedRoom = null }">
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
              <RouterLink :to="{ name: 'contract-detail', params: { id: o.contractId } }" class="text-xs text-primary hover:underline">
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
