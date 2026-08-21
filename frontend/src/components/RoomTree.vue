<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Building2, ChevronRight, DoorClosed, Layers, Plus } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import SearchSelect from '@/components/SearchSelect.vue'
import type { RoomTreeItem } from '@/lib/rooms-api'

const props = defineProps<{
  items: RoomTreeItem[]
  selectedId: number | null
  isLoading: boolean
  isDormitorySelected?: boolean
}>()
const emit = defineEmits<{ select: [id: number]; create: []; 'select-dormitory': [] }>()

const openFloors = reactive<Record<string, boolean>>({})

interface FloorGroup {
  key: string
  label: string
  rooms: RoomTreeItem[]
}

const floorGroups = computed<FloorGroup[]>(() => {
  const byFloor = new Map<number | null, RoomTreeItem[]>()
  for (const item of props.items) {
    const list = byFloor.get(item.floor)
    if (list) list.push(item)
    else byFloor.set(item.floor, [item])
  }
  const floors = [...byFloor.keys()].filter((f): f is number => f !== null).sort((a, b) => a - b)
  const groups: FloorGroup[] = floors.map((floor) => ({
    key: String(floor),
    label: `${floor} этаж`,
    rooms: byFloor.get(floor)!,
  }))
  const withoutFloor = byFloor.get(null)
  if (withoutFloor?.length) {
    groups.push({ key: 'none', label: 'Без этажа', rooms: withoutFloor })
  }
  return groups
})

function isFloorOpen(key: string): boolean {
  return openFloors[key] ?? false
}

// Поиск по дереву — клиентский фильтр по уже загруженному списку (тот же приём, что
// поиск комнаты в CreateContractDialog.vue). Выбор пункта эмитит тот же 'select', что
// и клик по комнате в дереве, — реальный клик имитировать не нужно: ветка раскрывается
// и комната подсвечивается сама, реактивно, через watch(selectedId) ниже.
const searchQuery = ref('')
const searchResults = ref<RoomTreeItem[]>([])
function onTreeSearch(q: string) {
  const query = q.trim().toLowerCase()
  searchResults.value = query ? props.items.filter((r) => r.room.toLowerCase().includes(query)) : []
}
function pickSearchResult(item: RoomTreeItem) {
  emit('select', item.id)
}

// Выбор комнаты снаружи (например, сразу после создания) — разворачиваем ветку дерева,
// в которой она лежит, чтобы подсветка была видна, а не пряталась в свёрнутом этаже.
watch(
  () => props.selectedId,
  (id) => {
    if (id === null) return
    const item = props.items.find((i) => i.id === id)
    if (!item) return
    openFloors[item.floor === null ? 'none' : String(item.floor)] = true
  },
)
</script>

<template>
  <div class="flex h-full min-w-0 flex-col">
    <!-- h-14 + border-b — та же высота и кегль, что и заголовок карточки комнаты
         справа (RoomDetailPanel.vue), чтобы обе панели выглядели единой парой. -->
    <div class="flex h-14 shrink-0 items-center justify-between border-b px-4">
      <h2 class="text-lg font-medium">Комнаты</h2>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button size="icon" variant="outline" class="size-7" @click="emit('create')">
            <Plus class="text-primary" />
            <span class="sr-only">Добавить комнату</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Добавить комнату</TooltipContent>
      </Tooltip>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-2">
      <p v-if="isLoading" class="px-2 py-1.5 text-sm text-muted-foreground">Загрузка…</p>
      <template v-else>
        <!-- Корень больше не сворачивается (по прямой просьбе) — обычная кнопка выбора,
             клик показывает компактную карточку с общежитскими полями в RoomDetailPanel
             вместо списка комнат конкретного этажа. -->
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium transition-colors hover:bg-accent"
          :class="isDormitorySelected ? 'bg-accent' : ''"
          @click="emit('select-dormitory')"
        >
          <Building2 class="size-4 shrink-0 text-primary" />
          <span class="truncate">Общежитие РосНОУ</span>
        </button>
        <div class="px-2 pt-2">
          <SearchSelect
            v-model="searchQuery"
            :items="searchResults"
            :item-key="(r: RoomTreeItem) => r.id"
            :item-label="(r: RoomTreeItem) => r.room"
            placeholder="Поиск комнаты…"
            @search="onTreeSearch"
            @select="pickSearchResult"
          />
        </div>
        <div class="ml-3 flex flex-col gap-0.5 border-l pl-2 pt-1">
          <p v-if="!floorGroups.length" class="px-2 py-1.5 text-sm text-muted-foreground">Комнат пока нет</p>
          <Collapsible
            v-for="group in floorGroups"
            :key="group.key"
            :open="isFloorOpen(group.key)"
            @update:open="(v) => (openFloors[group.key] = v)"
          >
            <CollapsibleTrigger
              class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
            >
              <ChevronRight
                class="size-4 shrink-0 text-muted-foreground transition-transform duration-200"
                :class="{ 'rotate-90': isFloorOpen(group.key) }"
              />
              <Layers class="size-4 shrink-0 text-primary" />
              <span class="truncate">{{ group.label }}</span>
              <span class="ml-auto shrink-0 text-xs text-muted-foreground">{{ group.rooms.length }}</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="ml-3 flex flex-col gap-0.5 border-l pl-2 pt-1">
                <button
                  v-for="room in group.rooms"
                  :key="room.id"
                  type="button"
                  class="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                  :class="selectedId === room.id && !isDormitorySelected ? 'bg-accent font-medium' : 'text-foreground'"
                  @click="emit('select', room.id)"
                >
                  <DoorClosed class="size-4 shrink-0" :class="selectedId === room.id && !isDormitorySelected ? 'text-primary' : 'text-muted-foreground'" />
                  <span class="truncate">{{ room.room }}</span>
                </button>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </template>
    </div>
  </div>
</template>
