<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AlertTriangle, CircleCheck, CircleX, Clock, FileText, User } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ReportKpiTile from '@/components/ReportKpiTile.vue'
import { fetchContractsRegistry, type ContractRegistryReport, type ContractRegistryBucket } from '@/lib/reports-api'

// Вертикальные разделители колонок — тот же приём, что и в остальных таблицах
// приложения (EntityTable.vue/ContractDetail.vue), для визуального единства.
const CELL_BORDER_CLASS = 'border-r border-border last:border-r-0'
// Ссылка-ячейка с иконкой (номер договора/ФИО) — тот же приём, что у ФИО на
// ContractDetail.vue: -mx/-my компенсируют паддинг ячейки под hover-подложку.
const CELL_LINK_CLASS =
  '-mx-1.5 -my-0.5 flex w-fit items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-accent-foreground'

const BUCKET_LABELS: Record<ContractRegistryBucket, string> = {
  ACTIVE: 'Активен',
  EXPIRING: 'Истекает',
  OVERDUE: 'Просрочен',
  TERMINATED: 'Расторгнут',
}
const BUCKET_ICON = {
  ACTIVE: CircleCheck,
  EXPIRING: Clock,
  OVERDUE: AlertTriangle,
  TERMINATED: CircleX,
} as const satisfies Record<ContractRegistryBucket, unknown>
// TERMINATED — красный, тот же цвет, что и у "Уже закончены" в KPI сверху (см. Card ниже).
const BUCKET_ICON_CLASS: Record<ContractRegistryBucket, string> = {
  ACTIVE: 'text-emerald-500',
  EXPIRING: 'text-orange-500',
  OVERDUE: 'text-red-500',
  TERMINATED: 'text-red-500',
}

const report = ref<ContractRegistryReport | null>(null)
const isLoading = ref(true)
const loadError = ref('')

async function load() {
  isLoading.value = true
  loadError.value = ''
  try {
    report.value = await fetchContractsRegistry()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isLoading.value = false
  }
}

onMounted(load)

const activeTab = ref<'all' | ContractRegistryBucket>('all')

const filteredContracts = computed(() => {
  const contracts = report.value?.contracts ?? []
  if (activeTab.value === 'all') return contracts
  return contracts.filter((c) => c.bucket === activeTab.value)
})

function statusLabel(bucket: ContractRegistryBucket, daysUntilEnd: number): string {
  if (bucket === 'EXPIRING') return `${BUCKET_LABELS.EXPIRING} (${daysUntilEnd} дн.)`
  if (bucket === 'OVERDUE') return `${BUCKET_LABELS.OVERDUE} на ${Math.abs(daysUntilEnd)} дн.`
  return BUCKET_LABELS[bucket]
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('ru-RU')
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <h1 class="text-lg font-medium">Реестр договоров</h1>

    <p v-if="loadError" class="text-sm text-red-500">{{ loadError }}</p>
    <p v-if="isLoading" class="text-sm text-muted-foreground">Загрузка…</p>

    <template v-else-if="report">
      <Card class="grid grid-cols-3 gap-4 p-4">
        <ReportKpiTile
          :icon="CircleCheck"
          bg-class="bg-emerald-100 dark:bg-emerald-500/15"
          icon-class="text-emerald-600 dark:text-emerald-400"
          label="Активные"
          :value="String(report.summary.active)"
        />
        <ReportKpiTile
          :icon="Clock"
          bg-class="bg-orange-100 dark:bg-orange-500/15"
          icon-class="text-orange-600 dark:text-orange-400"
          label="Истекают в течение 30 дней"
          :value="String(report.summary.expiring30)"
        />
        <ReportKpiTile
          :icon="CircleX"
          bg-class="bg-red-100 dark:bg-red-500/15"
          icon-class="text-red-600 dark:text-red-400"
          label="Уже закончены"
          :value="String(report.summary.ended)"
        />
      </Card>

      <Tabs :model-value="activeTab" @update:model-value="(v) => (activeTab = v as 'all' | ContractRegistryBucket)">
        <TabsList>
          <TabsTrigger value="all">Все</TabsTrigger>
          <TabsTrigger value="ACTIVE">Активные</TabsTrigger>
          <TabsTrigger value="EXPIRING">Истекают</TabsTrigger>
          <TabsTrigger value="OVERDUE">Просрочены</TabsTrigger>
          <TabsTrigger value="TERMINATED">Расторгнуты</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card class="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden py-0">
        <p v-if="!filteredContracts.length" class="p-6 text-sm text-muted-foreground">Договоров нет</p>
        <div v-else class="flex min-h-0 flex-1 flex-col">
          <Table>
            <TableHeader class="sticky top-0 z-10 bg-muted">
              <TableRow>
                <TableHead :class="CELL_BORDER_CLASS">Договор</TableHead>
                <TableHead :class="CELL_BORDER_CLASS">Проживающий</TableHead>
                <TableHead :class="CELL_BORDER_CLASS">Комната</TableHead>
                <TableHead :class="CELL_BORDER_CLASS">Дата создания</TableHead>
                <TableHead :class="CELL_BORDER_CLASS">Начало</TableHead>
                <TableHead :class="CELL_BORDER_CLASS">Окончание</TableHead>
                <TableHead>Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="c in filteredContracts" :key="c.contractId">
                <TableCell :class="CELL_BORDER_CLASS">
                  <RouterLink :to="{ name: 'contract-detail', params: { id: c.contractId } }" :class="CELL_LINK_CLASS">
                    <FileText class="size-4 shrink-0 text-primary" />
                    {{ c.contractNumber }}
                  </RouterLink>
                </TableCell>
                <TableCell :class="CELL_BORDER_CLASS">
                  <RouterLink :to="{ name: 'individual-detail', params: { uid: c.residentIndividualUid } }" :class="CELL_LINK_CLASS">
                    <User class="size-4 shrink-0 text-primary" />
                    {{ c.residentFullName }}
                  </RouterLink>
                </TableCell>
                <TableCell :class="CELL_BORDER_CLASS">{{ c.room ?? '—' }}</TableCell>
                <TableCell :class="CELL_BORDER_CLASS">{{ formatDate(c.createdAt) }}</TableCell>
                <TableCell :class="CELL_BORDER_CLASS">{{ formatDate(c.startDate) }}</TableCell>
                <TableCell :class="CELL_BORDER_CLASS">{{ formatDate(c.endDate) }}</TableCell>
                <TableCell>
                  <Badge variant="outline" class="gap-1 font-normal">
                    <component :is="BUCKET_ICON[c.bucket]" class="size-3.5" :class="BUCKET_ICON_CLASS[c.bucket]" />
                    {{ statusLabel(c.bucket, c.daysUntilEnd) }}
                  </Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>
    </template>
  </div>
</template>
