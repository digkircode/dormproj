<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Search, User } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fetchContingent, type ContingentRow } from '@/lib/reports-api'

// Вертикальные разделители колонок — тот же приём, что и в остальных таблицах
// приложения (EntityTable.vue/ContractDetail.vue), для визуального единства.
const CELL_BORDER_CLASS = 'border-r border-border last:border-r-0'

const rows = ref<ContingentRow[]>([])
const isLoading = ref(true)
const loadError = ref('')

async function load() {
  isLoading.value = true
  loadError.value = ''
  try {
    rows.value = await fetchContingent()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isLoading.value = false
  }
}

onMounted(load)

const search = ref('')
const facultetFilter = ref('all')
const kursFilter = ref('all')

const facultetOptions = computed(() => [...new Set(rows.value.map((r) => r.facultet).filter((f): f is string => f !== null))].sort())
const kursOptions = computed(() =>
  [...new Set(rows.value.map((r) => r.kursNumber).filter((k): k is number => k !== null))].sort((a, b) => a - b),
)

const filteredRows = computed(() => {
  const q = search.value.trim().toLowerCase()
  return rows.value.filter((r) => {
    if (facultetFilter.value !== 'all' && r.facultet !== facultetFilter.value) return false
    if (kursFilter.value !== 'all' && String(r.kursNumber) !== kursFilter.value) return false
    if (q && !r.residentFullName.toLowerCase().includes(q) && !r.contractNumber.toLowerCase().includes(q) && !r.room.toLowerCase().includes(q)) {
      return false
    }
    return true
  })
})

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('ru-RU')
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <h1 class="text-lg font-medium">Реестр проживающих</h1>

    <p v-if="loadError" class="text-sm text-red-500">{{ loadError }}</p>
    <p v-if="isLoading" class="text-sm text-muted-foreground">Загрузка…</p>

    <template v-else>
      <div class="flex flex-wrap items-center gap-2">
        <div class="relative w-64">
          <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input v-model="search" placeholder="ФИО, № договора, комната…" class="pl-8" />
        </div>
        <Select :model-value="facultetFilter" @update:model-value="(v) => (facultetFilter = String(v))">
          <SelectTrigger class="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все факультеты</SelectItem>
            <SelectItem v-for="f in facultetOptions" :key="f" :value="f">{{ f }}</SelectItem>
          </SelectContent>
        </Select>
        <Select :model-value="kursFilter" @update:model-value="(v) => (kursFilter = String(v))">
          <SelectTrigger class="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все курсы</SelectItem>
            <SelectItem v-for="k in kursOptions" :key="k" :value="String(k)">{{ k }} курс</SelectItem>
          </SelectContent>
        </Select>
        <span class="text-sm text-muted-foreground">Найдено: {{ filteredRows.length }}</span>
      </div>

      <Card class="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden py-0">
        <p v-if="!filteredRows.length" class="p-6 text-sm text-muted-foreground">Никто не найден</p>
        <div v-else class="flex min-h-0 flex-1 flex-col">
          <Table>
            <TableHeader class="sticky top-0 z-10 bg-muted">
              <TableRow>
                <TableHead :class="CELL_BORDER_CLASS">Дата заселения</TableHead>
                <TableHead :class="CELL_BORDER_CLASS">ФИО</TableHead>
                <TableHead :class="CELL_BORDER_CLASS">№ договора</TableHead>
                <TableHead :class="CELL_BORDER_CLASS">Комната</TableHead>
                <TableHead :class="CELL_BORDER_CLASS">Факультет</TableHead>
                <TableHead :class="CELL_BORDER_CLASS">Курс</TableHead>
                <TableHead :class="CELL_BORDER_CLASS">Дата рождения</TableHead>
                <TableHead>Гражданство</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="r in filteredRows" :key="r.contractId">
                <TableCell :class="CELL_BORDER_CLASS">{{ formatDate(r.movedInDate) }}</TableCell>
                <TableCell :class="CELL_BORDER_CLASS">
                  <RouterLink
                    :to="{ name: 'individual-detail', params: { uid: r.residentIndividualUid } }"
                    class="-mx-1.5 -my-0.5 flex w-fit items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <User class="size-4 shrink-0 text-primary" />
                    {{ r.residentFullName }}
                  </RouterLink>
                </TableCell>
                <TableCell :class="CELL_BORDER_CLASS">
                  <RouterLink :to="{ name: 'contract-detail', params: { id: r.contractId } }" class="text-primary hover:underline">
                    {{ r.contractNumber }}
                  </RouterLink>
                </TableCell>
                <TableCell :class="CELL_BORDER_CLASS">{{ r.room }}</TableCell>
                <TableCell :class="CELL_BORDER_CLASS">{{ r.facultet ?? '—' }}</TableCell>
                <TableCell :class="CELL_BORDER_CLASS">{{ r.kursNumber ?? '—' }}</TableCell>
                <TableCell :class="CELL_BORDER_CLASS">{{ r.birthDate ? formatDate(r.birthDate) : '—' }}</TableCell>
                <TableCell>{{ r.citizenship ?? '—' }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>
    </template>
  </div>
</template>
