<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
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

const { t } = useI18n()

// Захардкоженные моки (см. DormProjPrompt.md — Home.vue не подключена к бэкенду) — type/
// status остаются стабильными внутренними кодами, статус-варианты и подписи резолвятся
// от них через t(), а не хранятся уже переведённым текстом (иначе ломались бы при смене языка).
const tabs = computed(() => [
  { label: t('dataTable.tabAllRooms'), count: null },
  { label: t('dataTable.tabHasDebt'), count: 3 },
  { label: t('dataTable.tabContractExpiring'), count: 2 },
])

const rows = [
  { room: '204', type: 'double', status: 'paid', amount: '8 500 ₽', due: '01.09.2026', responsible: 'Иванова А.' },
  { room: '318', type: 'single', status: 'debt', amount: '12 000 ₽', due: '15.08.2026', responsible: 'Петров С.' },
  { room: '112', type: 'triple', status: 'in_progress', amount: '7 200 ₽', due: '01.09.2026', responsible: 'Сидорова М.' },
] as const

const typeLabels = computed<Record<(typeof rows)[number]['type'], string>>(() => ({
  double: t('dataTable.typeDouble'),
  single: t('dataTable.typeSingle'),
  triple: t('dataTable.typeTriple'),
}))
const statusLabels = computed<Record<(typeof rows)[number]['status'], string>>(() => ({
  paid: t('dataTable.statusPaid'),
  debt: t('dataTable.statusDebt'),
  in_progress: t('dataTable.statusInProgress'),
}))
const statusVariant: Record<(typeof rows)[number]['status'], 'default' | 'destructive' | 'secondary'> = {
  paid: 'default',
  debt: 'destructive',
  in_progress: 'secondary',
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
          {{ t('dataTable.columns') }}
        </Button>
        <Button size="sm">
          <Plus />
          {{ t('dataTable.add') }}
        </Button>
      </div>
    </div>

    <Table>
      <TableHeader>
        <TableRow>
          <TableHead class="w-10">
            <Checkbox />
          </TableHead>
          <TableHead>{{ t('dataTable.colRoom') }}</TableHead>
          <TableHead>{{ t('dataTable.colType') }}</TableHead>
          <TableHead>{{ t('dataTable.colStatus') }}</TableHead>
          <TableHead>{{ t('dataTable.colAmount') }}</TableHead>
          <TableHead>{{ t('dataTable.colDue') }}</TableHead>
          <TableHead>{{ t('dataTable.colResponsible') }}</TableHead>
          <TableHead class="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="row in rows" :key="row.room">
          <TableCell>
            <GripVertical class="size-4 text-muted-foreground" />
          </TableCell>
          <TableCell class="font-medium">{{ row.room }}</TableCell>
          <TableCell class="text-muted-foreground">{{ typeLabels[row.type] }}</TableCell>
          <TableCell>
            <Badge :variant="statusVariant[row.status]">{{ statusLabels[row.status] }}</Badge>
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
