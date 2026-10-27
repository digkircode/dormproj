<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CharacteristicValue, CharacteristicValueType } from '@/lib/rooms-api'

export interface RoomCharacteristicsGridRow {
  definitionId: number
  name: string
  valueType: CharacteristicValueType
  value: CharacteristicValue
  unit: string | null
  hasValue?: boolean
}

const CORE_ORDER = ['Этаж', 'Жилое помещение', 'Количество мест', 'Площадь', 'Стоимость (из вуза)', 'Стоимость (не из вуза)']

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    rows: RoomCharacteristicsGridRow[]
    interactive?: boolean
    selectedId?: number | null
  }>(),
  { interactive: false, selectedId: null },
)
const emit = defineEmits<{ select: [definitionId: number] }>()

function formatValue(entry: { valueType: CharacteristicValueType; value: CharacteristicValue; unit: string | null }): string {
  if (entry.value === null || entry.value === undefined) return '-'
  if (entry.valueType === 'BOOLEAN') return entry.value ? t('boolean.yes') : t('boolean.no')
  return entry.unit ? `${entry.value} ${entry.unit}` : String(entry.value)
}

const sortedRows = computed(() =>
  [...props.rows].sort((a, b) => {
    const ai = CORE_ORDER.indexOf(a.name)
    const bi = CORE_ORDER.indexOf(b.name)
    if (ai !== -1 || bi !== -1) {
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    }
    return a.name.localeCompare(b.name, 'ru')
  }),
)
</script>

<template>
  <TransitionGroup
    tag="div"
    class="grid grid-cols-1 gap-0 overflow-hidden rounded-md border sm:grid-cols-2"
    :enter-active-class="interactive ? 'animate-in fade-in-0 duration-200' : ''"
    :leave-active-class="interactive ? 'animate-out fade-out-0 duration-200' : ''"
    :move-class="interactive ? 'transition-transform duration-200' : ''"
  >
    <div
      v-for="(c, index) in sortedRows"
      :key="c.definitionId"
      class="flex items-center justify-between gap-2 px-3 py-2 text-sm"
      :class="[
        interactive ? 'cursor-pointer hover:bg-accent' : '',
        interactive && selectedId === c.definitionId ? 'bg-accent' : '',
        index % 2 === 1 ? 'sm:border-l sm:border-border' : '',
        index > 0 ? 'border-t border-border' : '',
        index === 1 ? 'sm:border-t-0' : '',
      ]"
      @click="interactive && emit('select', c.definitionId)"
    >
      <span class="min-w-0 truncate text-muted-foreground">{{ c.name }}</span>
      <span class="shrink-0 font-medium">{{ c.hasValue === false ? '-' : formatValue(c) }}</span>
    </div>
    <div
      v-if="sortedRows.length % 2 === 1"
      key="grid-placeholder"
      aria-hidden="true"
      class="hidden border-l border-t border-border sm:block"
    />
  </TransitionGroup>
</template>
