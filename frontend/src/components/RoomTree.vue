<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Building2, ChevronRight, DoorClosed, Layers, Plus } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { RoomTreeItem } from '@/lib/rooms-api'

const props = defineProps<{
  items: RoomTreeItem[]
  selectedId: number | null
  isLoading: boolean
}>()
const emit = defineEmits<{ select: [id: number]; create: [] }>()

const rootOpen = ref(true)
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

// Выбор комнаты снаружи (например, сразу после создания) — разворачиваем ветку дерева,
// в которой она лежит, чтобы подсветка была видна, а не пряталась в свёрнутом этаже.
watch(
  () => props.selectedId,
  (id) => {
    if (id === null) return
    const item = props.items.find((i) => i.id === id)
    if (!item) return
    rootOpen.value = true
    openFloors[item.floor === null ? 'none' : String(item.floor)] = true
  },
)
</script>

<template>
  <div class="flex h-full min-w-0 flex-col gap-2 p-2">
    <div class="flex items-center justify-between px-1">
      <span class="text-sm font-medium text-muted-foreground">Комнаты</span>
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

    <div class="min-h-0 flex-1 overflow-y-auto">
      <p v-if="isLoading" class="px-2 py-1.5 text-sm text-muted-foreground">Загрузка…</p>
      <Collapsible v-else :open="rootOpen" @update:open="(v) => (rootOpen = v)">
        <CollapsibleTrigger
          class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium transition-colors hover:bg-accent"
        >
          <ChevronRight
            class="size-4 shrink-0 text-muted-foreground transition-transform duration-200"
            :class="{ 'rotate-90': rootOpen }"
          />
          <Building2 class="size-4 shrink-0 text-primary" />
          <span class="truncate">Общежитие РосНОУ</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
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
                    :class="selectedId === room.id ? 'bg-accent font-medium' : 'text-foreground'"
                    @click="emit('select', room.id)"
                  >
                    <DoorClosed class="size-4 shrink-0" :class="selectedId === room.id ? 'text-primary' : 'text-muted-foreground'" />
                    <span class="truncate">{{ room.room }}</span>
                  </button>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  </div>
</template>
