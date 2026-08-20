<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { AlertTriangle, CircleCheck, CircleX, Clock } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ReportKpiTile from '@/components/ReportKpiTile.vue'
import { fetchContractsRegistry, type ContractRegistryReport, type ContractRegistryBucket } from '@/lib/reports-api'

const router = useRouter()

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
const BUCKET_ICON_CLASS: Record<ContractRegistryBucket, string> = {
  ACTIVE: 'text-emerald-500',
  EXPIRING: 'text-orange-500',
  OVERDUE: 'text-red-500',
  TERMINATED: 'text-muted-foreground',
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
const attentionOnly = ref(false)

function selectTab(tab: 'all' | ContractRegistryBucket) {
  activeTab.value = tab
  attentionOnly.value = false
}
function toggleAttention() {
  attentionOnly.value = !attentionOnly.value
  if (attentionOnly.value) activeTab.value = 'all'
}

const filteredContracts = computed(() => {
  const contracts = report.value?.contracts ?? []
  if (attentionOnly.value) return contracts.filter((c) => c.bucket === 'EXPIRING' || c.bucket === 'OVERDUE')
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
          bg-class="bg-muted"
          icon-class="text-muted-foreground"
          label="Уже закончены"
          :value="String(report.summary.ended)"
        />
      </Card>

      <div class="flex flex-wrap items-center justify-between gap-2">
        <Tabs :model-value="activeTab" @update:model-value="(v) => selectTab(v as 'all' | ContractRegistryBucket)">
          <TabsList>
            <TabsTrigger value="all">Все</TabsTrigger>
            <TabsTrigger value="ACTIVE">Активные</TabsTrigger>
            <TabsTrigger value="EXPIRING">Истекают</TabsTrigger>
            <TabsTrigger value="OVERDUE">Просрочены</TabsTrigger>
            <TabsTrigger value="TERMINATED">Расторгнуты</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button :variant="attentionOnly ? 'default' : 'outline'" size="sm" @click="toggleAttention">
          <AlertTriangle class="size-4" />
          Показать только требующие внимания
        </Button>
      </div>

      <Card class="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden py-0">
        <p v-if="!filteredContracts.length" class="p-6 text-sm text-muted-foreground">Договоров нет</p>
        <div v-else class="flex min-h-0 flex-1 flex-col">
          <Table>
            <TableHeader class="sticky top-0 z-10 bg-muted">
              <TableRow>
                <TableHead>Договор</TableHead>
                <TableHead>Проживающий</TableHead>
                <TableHead>Комната</TableHead>
                <TableHead>Начало</TableHead>
                <TableHead>Окончание</TableHead>
                <TableHead>Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="c in filteredContracts"
                :key="c.contractId"
                class="cursor-pointer"
                @click="router.push({ name: 'contract-detail', params: { id: c.contractId } })"
              >
                <TableCell>{{ c.contractNumber }}</TableCell>
                <TableCell>{{ c.residentFullName }}</TableCell>
                <TableCell>{{ c.room ?? '—' }}</TableCell>
                <TableCell>{{ formatDate(c.startDate) }}</TableCell>
                <TableCell>{{ formatDate(c.endDate) }}</TableCell>
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
