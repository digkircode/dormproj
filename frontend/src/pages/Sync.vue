<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileText, Loader, Play } from 'lucide-vue-next'
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
import { statusIcon, statusIconClass } from '@/lib/sync-format'

const studentSync = useSyncRow('Контингент студентов', '/sync/students')
const individualsSync = useSyncRow('Физические лица', '/sync/individuals')
const citizenshipSync = useSyncRow('Гражданство', '/sync/citizenship')
const passportSync = useSyncRow('Паспортные данные', '/sync/passport')
const contactInfoSync = useSyncRow('Контактная информация', '/sync/contact-info')

const rows = computed(() => [
  { ...studentSync.row.value, isRunning: studentSync.isRunning.value, run: studentSync.run, slug: 'students' },
  { ...individualsSync.row.value, isRunning: individualsSync.isRunning.value, run: individualsSync.run, slug: 'individuals' },
  { ...citizenshipSync.row.value, isRunning: citizenshipSync.isRunning.value, run: citizenshipSync.run, slug: 'citizenship' },
  { ...passportSync.row.value, isRunning: passportSync.isRunning.value, run: passportSync.run, slug: 'passport' },
  { ...contactInfoSync.row.value, isRunning: contactInfoSync.isRunning.value, run: contactInfoSync.run, slug: 'contact-info' },
])

onMounted(() => {
  studentSync.refresh()
  individualsSync.refresh()
  citizenshipSync.refresh()
  passportSync.refresh()
  contactInfoSync.refresh()
})
</script>

<template>
  <div class="flex flex-1 flex-col gap-4 p-4 md:p-6">
    <Card class="gap-0 py-0">
      <Table>
        <TableHeader class="bg-muted sticky top-0 z-10">
          <TableRow>
            <TableHead>Название</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead>Время</TableHead>
            <TableHead class="whitespace-nowrap">Длительность</TableHead>
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
                  <Button variant="ghost" size="icon" class="size-7" as-child>
                    <RouterLink :to="`/sync/${row.slug}/logs`">
                      <FileText />
                      <span class="sr-only">Логи</span>
                    </RouterLink>
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
