<script setup lang="ts">
import { Columns3, Plus, GripVertical, MoreVertical } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'

const tabs = [
  { label: 'Все комнаты', count: null },
  { label: 'Есть долг', count: 3 },
  { label: 'Договор истекает', count: 2 },
]

const rows = [
  { room: '204', type: 'Двухместная', status: 'Оплачено', amount: '8 500 ₽', due: '01.09.2026', responsible: 'Иванова А.' },
  { room: '318', type: 'Одноместная', status: 'Долг', amount: '12 000 ₽', due: '15.08.2026', responsible: 'Петров С.' },
  { room: '112', type: 'Трёхместная', status: 'В процессе', amount: '7 200 ₽', due: '01.09.2026', responsible: 'Сидорова М.' },
]

const statusVariant: Record<string, 'default' | 'destructive' | 'secondary'> = {
  'Оплачено': 'default',
  'Долг': 'destructive',
  'В процессе': 'secondary',
}
</script>

<template>
  <Card class="gap-0 py-0">
    <div class="flex items-center justify-between border-b p-3">
      <div class="flex items-center gap-1 rounded-lg bg-muted p-1">
        <Button v-for="tab in tabs" :key="tab.label" variant="ghost" size="sm" class="gap-1.5">
          {{ tab.label }}
          <Badge v-if="tab.count" variant="secondary" class="rounded-full px-1.5">{{ tab.count }}</Badge>
        </Button>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm">
          <Columns3 />
          Столбцы
        </Button>
        <Button size="sm">
          <Plus />
          Добавить
        </Button>
      </div>
    </div>

    <Table>
      <TableHeader>
        <TableRow>
          <TableHead class="w-10">
            <Checkbox />
          </TableHead>
          <TableHead>Комната</TableHead>
          <TableHead>Тип</TableHead>
          <TableHead>Статус</TableHead>
          <TableHead>Сумма</TableHead>
          <TableHead>Срок</TableHead>
          <TableHead>Ответственный</TableHead>
          <TableHead class="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="row in rows" :key="row.room">
          <TableCell>
            <GripVertical class="size-4 text-muted-foreground" />
          </TableCell>
          <TableCell class="font-medium">{{ row.room }}</TableCell>
          <TableCell class="text-muted-foreground">{{ row.type }}</TableCell>
          <TableCell>
            <Badge :variant="statusVariant[row.status]">{{ row.status }}</Badge>
          </TableCell>
          <TableCell>{{ row.amount }}</TableCell>
          <TableCell class="text-muted-foreground">{{ row.due }}</TableCell>
          <TableCell class="text-muted-foreground">{{ row.responsible }}</TableCell>
          <TableCell>
            <MoreVertical class="size-4 text-muted-foreground" />
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </Card>
</template>
