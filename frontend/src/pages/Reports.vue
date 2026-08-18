<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { fetchDebtors, fetchCurrentResidents, type DebtorRow, type CurrentResidentRow, type AgingBucket } from '@/lib/reports-api'

const router = useRouter()

const AGING_LABELS: Record<AgingBucket, string> = {
  CURRENT: 'В срок',
  D1_30: '1–30 дней',
  D31_60: '31–60 дней',
  D61_90: '61–90 дней',
  D90_PLUS: '90+ дней',
}
const AGING_VARIANTS: Record<AgingBucket, 'default' | 'secondary' | 'destructive'> = {
  CURRENT: 'secondary',
  D1_30: 'default',
  D31_60: 'default',
  D61_90: 'destructive',
  D90_PLUS: 'destructive',
}

const debtors = ref<DebtorRow[]>([])
const residents = ref<CurrentResidentRow[]>([])
const isLoading = ref(true)
const loadError = ref('')

async function load() {
  isLoading.value = true
  loadError.value = ''
  try {
    ;[debtors.value, residents.value] = await Promise.all([fetchDebtors(), fetchCurrentResidents()])
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isLoading.value = false
  }
}

onMounted(load)

function formatMoney(value: number): string {
  return `${value.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`
}
function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('ru-RU')
}
</script>

<template>
  <div class="flex flex-1 flex-col gap-4 p-4 md:p-6">
    <h1 class="text-lg font-medium">Отчёты</h1>

    <p v-if="loadError" class="text-sm text-red-500">{{ loadError }}</p>
    <p v-if="isLoading" class="text-sm text-muted-foreground">Загрузка…</p>

    <Tabs v-else default-value="debtors">
      <TabsList>
        <TabsTrigger value="debtors">Должники ({{ debtors.length }})</TabsTrigger>
        <TabsTrigger value="residents">Кто проживает ({{ residents.length }})</TabsTrigger>
      </TabsList>

      <TabsContent value="debtors">
        <Card class="min-w-0 gap-0 py-0">
          <div class="overflow-hidden rounded-lg border">
            <p v-if="!debtors.length" class="p-6 text-sm text-muted-foreground">Должников нет</p>
            <Table v-else>
              <TableHeader class="bg-muted">
                <TableRow>
                  <TableHead>№ договора</TableHead>
                  <TableHead>Проживающий</TableHead>
                  <TableHead>Комната</TableHead>
                  <TableHead>Основной долг</TableHead>
                  <TableHead>Пеня</TableHead>
                  <TableHead>Итого</TableHead>
                  <TableHead>Просрочка</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow
                  v-for="d in debtors"
                  :key="d.contractId"
                  class="cursor-pointer"
                  @click="router.push({ name: 'contract-detail', params: { id: d.contractId } })"
                >
                  <TableCell>{{ d.contractNumber }}</TableCell>
                  <TableCell>{{ d.residentFullName }}</TableCell>
                  <TableCell>{{ d.room ?? '—' }}</TableCell>
                  <TableCell>{{ formatMoney(d.principalBalance) }}</TableCell>
                  <TableCell>{{ formatMoney(d.penaltyBalance) }}</TableCell>
                  <TableCell class="font-medium">{{ formatMoney(d.totalBalance) }}</TableCell>
                  <TableCell>
                    <Badge :variant="AGING_VARIANTS[d.agingBucket]">{{ AGING_LABELS[d.agingBucket] }}</Badge>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </Card>
      </TabsContent>

      <TabsContent value="residents">
        <Card class="min-w-0 gap-0 py-0">
          <div class="overflow-hidden rounded-lg border">
            <p v-if="!residents.length" class="p-6 text-sm text-muted-foreground">Никто не проживает</p>
            <Table v-else>
              <TableHeader class="bg-muted">
                <TableRow>
                  <TableHead>№ договора</TableHead>
                  <TableHead>Проживающий</TableHead>
                  <TableHead>Комната</TableHead>
                  <TableHead>Заселён с</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow
                  v-for="r in residents"
                  :key="r.contractId"
                  class="cursor-pointer"
                  @click="router.push({ name: 'contract-detail', params: { id: r.contractId } })"
                >
                  <TableCell>{{ r.contractNumber }}</TableCell>
                  <TableCell>{{ r.residentFullName }}</TableCell>
                  <TableCell>{{ r.room }}</TableCell>
                  <TableCell>{{ formatDate(r.fromDate) }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </Card>
      </TabsContent>
    </Tabs>
  </div>
</template>
