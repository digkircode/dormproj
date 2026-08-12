<script setup lang="ts">
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

const rows = [
  { name: 'Контингент студентов', status: 'Успешно', time: '12.08.2026 03:00', duration: '0м 47с' },
  { name: 'Синхронизация оплат', status: 'Успешно', time: '12.08.2026 09:14', duration: '1м 42с' },
  { name: 'Импорт заселения', status: 'Успешно', time: '12.08.2026 06:00', duration: '3м 05с' },
  { name: 'Синхронизация оплат', status: 'Ошибка', time: '11.08.2026 09:14', duration: '0м 18с' },
  { name: 'Обновление договоров', status: 'В процессе', time: '11.08.2026 22:47', duration: '—' },
]

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
</script>

<template>
  <div class="flex flex-1 flex-col gap-4 p-4 md:p-6">
    <Card class="gap-0 py-0">
      <Table>
        <TableHeader>
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
                  <Button variant="ghost" size="icon" class="size-7">
                    <Play />
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
