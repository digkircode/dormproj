<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileText, CircleCheck, CircleX, Loader, Play } from 'lucide-vue-next'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { useSyncRow } from '@/composables/useSyncRow'

const staticRows = [
  { name: 'Контактная информация', status: '—', time: '—', duration: '—' },
]

const studentSync = useSyncRow('Контингент студентов', '/sync/students')
const individualsSync = useSyncRow('Физические лица', '/sync/individuals')
const citizenshipSync = useSyncRow('Гражданство', '/sync/citizenship')
const passportSync = useSyncRow('Паспортные данные', '/sync/passport')

const rows = computed(() => [
  { ...studentSync.row.value, isRunning: studentSync.isRunning.value, run: studentSync.run },
  { ...individualsSync.row.value, isRunning: individualsSync.isRunning.value, run: individualsSync.run },
  { ...citizenshipSync.row.value, isRunning: citizenshipSync.isRunning.value, run: citizenshipSync.run },
  { ...passportSync.row.value, isRunning: passportSync.isRunning.value, run: passportSync.run },
  ...staticRows.map((r) => ({ ...r, isReal: false as const, isRunning: false, run: undefined })),
])

const errorText = computed(
  () =>
    studentSync.errorText.value ||
    individualsSync.errorText.value ||
    citizenshipSync.errorText.value ||
    passportSync.errorText.value,
)

const statusIcon = {
  'Успешно': CircleCheck,
  'Ошибка': CircleX,
  'В процессе': Loader,
} as const

const statusIconClass: Record<string, string> = {
  'Успешно': 'fill-emerald-500 text-white',
  'Ошибка': 'fill-red-500 text-white',
  'В процессе': 'animate-spin text-muted-foreground',
}

onMounted(() => {
  studentSync.refresh()
  individualsSync.refresh()
  citizenshipSync.refresh()
  passportSync.refresh()
})
</script>

<template>
  <div class="flex flex-1 flex-col gap-4 p-4 md:p-6">
    <p v-if="errorText" class="text-sm text-red-500">{{ errorText }}</p>
    <Card class="gap-0 py-0">
      <Table>
        <TableHeader class="bg-muted sticky top-0 z-10">
          <TableRow>
            <TableHead>Название</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead>Время</TableHead>
            <TableHead class="whitespace-nowrap">Длит.</TableHead>
            <TableHead class="w-10" />
            <TableHead class="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="(row, i) in rows" :key="i">
            <TableCell class="font-medium">{{ row.name }}</TableCell>
            <TableCell>
              <span class="flex items-center gap-2">
                <component :is="statusIcon[row.status as keyof typeof statusIcon]" class="size-4" :class="statusIconClass[row.status]" />
                {{ row.status }}
              </span>
            </TableCell>
            <TableCell class="text-muted-foreground">{{ row.time }}</TableCell>
            <TableCell class="whitespace-nowrap text-muted-foreground">{{ row.duration }}</TableCell>
            <TableCell>
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button variant="ghost" size="icon" class="size-7">
                    <FileText />
                    <span class="sr-only">Логи</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Просмотреть логи</TooltipContent>
              </Tooltip>
            </TableCell>
            <TableCell>
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="size-7"
                    :disabled="row.isReal && row.isRunning"
                    @click="row.isReal ? row.run() : undefined"
                  >
                    <Loader v-if="row.isReal && row.isRunning" class="animate-spin" />
                    <Play v-else />
                    <span class="sr-only">Запустить</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Запустить синхронизацию</TooltipContent>
              </Tooltip>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Card>
  </div>
</template>
