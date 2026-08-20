<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRightLeft, LogIn, LogOut } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import DateRangePickerField from '@/components/DateRangePickerField.vue'
import ReportKpiTile from '@/components/ReportKpiTile.vue'
import { fetchMovements, type MovementsReport, type MovementOperation } from '@/lib/reports-api'

const router = useRouter()

const OPERATION_LABELS: Record<MovementOperation, string> = {
  IN: 'Заселение',
  OUT: 'Выселение',
  MOVE: 'Переселение',
}
const OPERATION_DOT_CLASS: Record<MovementOperation, string> = {
  IN: 'bg-emerald-500',
  OUT: 'bg-red-500',
  MOVE: 'bg-blue-500',
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}
function isoStartOfMonth(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10)
}

const from = ref(isoStartOfMonth())
const to = ref(isoToday())

const report = ref<MovementsReport | null>(null)
const isLoading = ref(true)
const loadError = ref('')

async function load() {
  if (!from.value || !to.value) return
  isLoading.value = true
  loadError.value = ''
  try {
    report.value = await fetchMovements(from.value, to.value)
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isLoading.value = false
  }
}

onMounted(load)
watch([from, to], load)

const typeFilter = ref<'all' | MovementOperation>('all')
const filteredEvents = computed(() => {
  const events = report.value?.events ?? []
  if (typeFilter.value === 'all') return events
  return events.filter((e) => e.operation === typeFilter.value)
})

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('ru-RU')
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <h1 class="text-lg font-medium">Заселение / выселение</h1>

    <div class="flex flex-wrap items-center gap-2">
      <span class="text-sm text-muted-foreground">Период</span>
      <DateRangePickerField v-model:from="from" v-model:to="to" />
      <Select :model-value="typeFilter" @update:model-value="(v) => (typeFilter = v as 'all' | MovementOperation)">
        <SelectTrigger class="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Все операции</SelectItem>
          <SelectItem value="IN">Заселение</SelectItem>
          <SelectItem value="OUT">Выселение</SelectItem>
          <SelectItem value="MOVE">Переселение</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <p v-if="loadError" class="text-sm text-red-500">{{ loadError }}</p>
    <p v-if="isLoading" class="text-sm text-muted-foreground">Загрузка…</p>

    <template v-else-if="report">
      <Card class="grid grid-cols-3 gap-4 p-4">
        <ReportKpiTile
          :icon="LogIn"
          bg-class="bg-emerald-100 dark:bg-emerald-500/15"
          icon-class="text-emerald-600 dark:text-emerald-400"
          label="Заселено"
          :value="String(report.summary.movedIn)"
        />
        <ReportKpiTile
          :icon="LogOut"
          bg-class="bg-red-100 dark:bg-red-500/15"
          icon-class="text-red-600 dark:text-red-400"
          label="Выселено"
          :value="String(report.summary.movedOut)"
        />
        <ReportKpiTile
          :icon="ArrowRightLeft"
          bg-class="bg-blue-100 dark:bg-blue-500/15"
          icon-class="text-blue-600 dark:text-blue-400"
          label="Переселено"
          :value="String(report.summary.relocated)"
        />
      </Card>

      <Card class="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden py-0">
        <p v-if="!filteredEvents.length" class="p-6 text-sm text-muted-foreground">Событий за период нет</p>
        <div v-else class="flex min-h-0 flex-1 flex-col">
          <Table>
            <TableHeader class="sticky top-0 z-10 bg-muted">
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead>Проживающий</TableHead>
                <TableHead>Операция</TableHead>
                <TableHead>Откуда</TableHead>
                <TableHead>Куда</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="(e, i) in filteredEvents"
                :key="`${e.contractId}-${e.operation}-${e.date}-${i}`"
                class="cursor-pointer"
                @click="router.push({ name: 'contract-detail', params: { id: e.contractId } })"
              >
                <TableCell>{{ formatDate(e.date) }}</TableCell>
                <TableCell>{{ e.residentFullName }}</TableCell>
                <TableCell>
                  <span class="inline-flex items-center gap-1.5">
                    <span class="size-2 rounded-full" :class="OPERATION_DOT_CLASS[e.operation]" />
                    {{ OPERATION_LABELS[e.operation] }}
                  </span>
                </TableCell>
                <TableCell>{{ e.from ?? '—' }}</TableCell>
                <TableCell>{{ e.to ?? '—' }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>
    </template>
  </div>
</template>
