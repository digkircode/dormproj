<script setup lang="ts">
import { User } from 'lucide-vue-next'

defineProps<{ value: unknown; row?: unknown }>()

// w-fit max-w-full — без него flex-обёртка в <td> растягивается на всю ширину
// ячейки (блочный flex-элемент по умолчанию 100% ширины родителя), и hover-подложка
// подсвечивает всю ячейку, а не только текст с иконкой (см. ловушку №24 в промпте
// проекта про этот же класс проблем с cellRenderer).
const LINK_CLASS =
  '-mx-1.5 -my-0.5 flex w-fit max-w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-accent-foreground'
</script>

<template>
  <RouterLink
    :to="{ name: 'individual-detail', params: { uid: (row as { residentIndividualUid: string }).residentIndividualUid } }"
    :class="LINK_CLASS"
  >
    <User class="size-4 shrink-0 text-primary" />
    <span class="min-w-0 truncate">{{ value }}</span>
  </RouterLink>
</template>
