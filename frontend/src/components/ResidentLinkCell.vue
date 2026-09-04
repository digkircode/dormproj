<script setup lang="ts">
import { User } from 'lucide-vue-next'

const props = defineProps<{ value: unknown; row?: unknown }>()

// w-fit max-w-full — без него flex-обёртка в <td> растягивается на всю ширину
// ячейки (блочный flex-элемент по умолчанию 100% ширины родителя), и hover-подложка
// подсвечивает всю ячейку, а не только текст с иконкой (см. ловушку №24 в промпте
// проекта про этот же класс проблем с cellRenderer).
const LINK_CLASS =
  '-mx-1.5 -my-0.5 flex w-fit max-w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-accent-foreground'

// residentIndividualUid — необязательный (не все вызывающие таблицы гарантируют опознанного
// человека на каждой строке, например ФИО из 1С Бухгалтерии, ещё не сопоставленное ни с
// одним нашим договором, см. PaymentImports.vue) — без него просто текст, без ссылки.
const residentIndividualUid = (props.row as { residentIndividualUid?: string } | undefined)?.residentIndividualUid
</script>

<template>
  <RouterLink v-if="residentIndividualUid != null" :to="{ name: 'individual-detail', params: { uid: residentIndividualUid } }" :class="LINK_CLASS">
    <User class="size-4 shrink-0 text-primary" />
    <span class="min-w-0 truncate">{{ value }}</span>
  </RouterLink>
  <span v-else class="min-w-0 truncate text-muted-foreground">{{ value ?? '—' }}</span>
</template>
