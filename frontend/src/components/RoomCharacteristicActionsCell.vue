<script setup lang="ts">
import { inject } from 'vue'
import { Pencil, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { RoomCharacteristicDefinition } from '@/lib/room-characteristic-definitions-api'
import { DEFINITION_ACTIONS_KEY } from '@/lib/definition-actions-key'

// row — row.original из EntityTable (см. cellRenderers), а не value (та колонка
// декоративная, без accessor). Обработчики приходят через provide/inject от
// RoomCharacteristics.vue — EntityTable не прокидывает emit из cellRenderers наружу.
defineProps<{ value: unknown; row: RoomCharacteristicDefinition }>()

const actions = inject(DEFINITION_ACTIONS_KEY)
</script>

<template>
  <div class="flex items-center justify-end gap-1">
    <Button variant="ghost" size="icon" class="size-7" @click="actions?.edit(row)">
      <Pencil class="text-primary" />
      <span class="sr-only">Изменить</span>
    </Button>
    <Tooltip v-if="row.isProtected">
      <TooltipTrigger as-child>
        <Button variant="ghost" size="icon" class="size-7" disabled>
          <Trash2 class="text-muted-foreground" />
          <span class="sr-only">Удалить</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Эту характеристику нельзя удалить</TooltipContent>
    </Tooltip>
    <Button v-else variant="ghost" size="icon" class="size-7" @click="actions?.remove(row)">
      <Trash2 class="text-red-500" />
      <span class="sr-only">Удалить</span>
    </Button>
  </div>
</template>
