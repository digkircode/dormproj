<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CharacteristicValue, CharacteristicValueType } from '@/lib/rooms-api'

// Сетка "название слева/значение справа" для характеристик комнаты — общая для карточки
// комнаты (RoomDetailPanel.vue, кликабельная, с анимацией добавления/удаления строк) и
// быстрой справки из карточки договора/списка (RoomInfoTrigger.vue, статичная). Вынесено
// сюда 2026-08-28 — раньше был один и тот же грид (разметка, сортировка, formatValue)
// продублирован в обоих файлах дословно. Таблицу истории в RoomDetailPanel.vue не
// трогали — свой отдельный порядок сортировки, не про эту сетку.
export interface RoomCharacteristicsGridRow {
  // Двойное назначение: ключ TransitionGroup И (в interactive-режиме) значение
  // select/selectedId — definitionId, не id самой записи, чтобы "пустая" синтетическая
  // строка защищённой характеристики и появившееся позже настоящее значение той же
  // характеристики анимировались как ОДИН и тот же элемент, а не удаление+добавление (так
  // и было раньше в RoomDetailPanel.vue). Заодно — оба вызывающих компонента (RoomDetail/
  // RoomCharacteristic из rooms-api.ts) уже несут это поле само по себе, передать массив
  // сюда можно без промежуточного маппинга.
  definitionId: number
  name: string
  valueType: CharacteristicValueType
  value: CharacteristicValue
  unit: string | null
  // По умолчанию true — используется только для "пустых" синтетических строк защищённых
  // характеристик без значения (см. displayCharacteristics в RoomDetailPanel.vue).
  hasValue?: boolean
}

// Тот же порядок, что раньше был продублирован в RoomDetailPanel.vue/RoomInfoTrigger.vue —
// сначала стартовые защищённые характеристики в фиксированном порядке, потом остальные
// по алфавиту.
const CORE_ORDER = ['Этаж', 'Жилое помещение', 'Количество мест', 'Площадь', 'Стоимость (из вуза)', 'Стоимость (не из вуза)']

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    rows: RoomCharacteristicsGridRow[]
    // Кликабельные строки с подсветкой активной + анимация добавления/удаления
    // (TransitionGroup) — карточка комнаты, где строки реально меняются и фильтруют
    // историю ниже. Без этого — статичная справка, как в RoomInfoTrigger.vue.
    interactive?: boolean
    selectedId?: number | null
  }>(),
  { interactive: false, selectedId: null },
)
const emit = defineEmits<{ select: [definitionId: number] }>()

function formatValue(entry: { valueType: CharacteristicValueType; value: CharacteristicValue; unit: string | null }): string {
  if (entry.value === null || entry.value === undefined) return '—'
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
  <!-- Вертикальный разделитель по чётности индекса (не divide-x — у CSS grid с 2
       колонками divide-x лёг бы на случайную сторону в зависимости от потока) +
       горизонтальный между строками (border-t от второй строки, на sm — от index>=2, т.к.
       там 2 колонки и первая строка — это index 0 и 1). overflow-hidden на контейнере —
       чтобы прямоугольные ячейки не вылезали за скруглённые углы рамки. Пустые classes на
       enter/leave/move в неинтерактивном режиме — TransitionGroup остаётся нужен только
       ради самого grid-контейнера (tag="div"), без анимации ничего не подмешивает. -->
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
      <span class="shrink-0 font-medium">{{ c.hasValue === false ? '—' : formatValue(c) }}</span>
    </div>
    <!-- Нечётное количество характеристик — последняя карточка одна в своей строке,
         пустое место остаётся пустым, а не растягивается на обе колонки. Вместо этого
         невидимая ячейка во второй колонке с той же border-t/border-l линией, что была бы
         у настоящей пары — только чтобы разделитель всё равно доходил до правого края. -->
    <div
      v-if="sortedRows.length % 2 === 1"
      key="grid-placeholder"
      aria-hidden="true"
      class="hidden border-l border-t border-border sm:block"
    />
  </TransitionGroup>
</template>
