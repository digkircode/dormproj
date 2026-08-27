<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { AlertTriangle, Clock, DoorOpen, FileSignature, MessageCircle, UserPlus } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import CreateIndividualDialog from '@/components/CreateIndividualDialog.vue'
import CreateContractDialog from '@/components/CreateContractDialog.vue'
import {
  fetchOccupancy,
  fetchDebtorsSummary,
  fetchDebtorsPage,
  fetchContractsRegistrySummary,
  fetchContractsRegistryPage,
  type OccupancyReport,
  type DebtorsSummary,
  type DebtorRow,
  type ContractsRegistrySummary,
  type ContractRegistryRow,
} from '@/lib/reports-api'
import { fetchConversations } from '@/lib/chat-api'
import { dateLocaleTag } from '@/lib/format-locale'

const { t } = useI18n()

// Главная для роли STAFF/ADMIN (см. Home.vue) — вместо моков (StatCard/AreaChart/DataTable,
// удалены) реальные плашки поверх уже существующих отчётных эндпоинтов, ничего нового на
// бэкенде заводить не пришлось (по прямой просьбе 2026-08-27).
const occupancy = ref<OccupancyReport | null>(null)
const debtorsSummary = ref<DebtorsSummary | null>(null)
const topDebtors = ref<DebtorRow[]>([])
const contractsSummary = ref<ContractsRegistrySummary | null>(null)
const topExpiring = ref<ContractRegistryRow[]>([])
const unreadChatsCount = ref(0)
const isLoading = ref(true)

function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}
function formatMoney(value: number): string {
  return `${value.toLocaleString(dateLocaleTag(), { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`
}

onMounted(async () => {
  const asOf = isoToday()
  const baseListOptions = { page: 1, pageSize: 4, search: '' }
  const [occ, debtSummary, debtRows, regSummary, expiringRows, conversations] = await Promise.all([
    fetchOccupancy().catch(() => null),
    fetchDebtorsSummary(asOf).catch(() => null),
    fetchDebtorsPage({ ...baseListOptions, sortBy: 'totalBalance', sortDir: 'desc', filters: {} }, asOf).catch(() => null),
    fetchContractsRegistrySummary().catch(() => null),
    fetchContractsRegistryPage({ ...baseListOptions, sortBy: 'endDate', sortDir: 'asc', filters: { bucket: ['EXPIRING'] } }).catch(() => null),
    fetchConversations().catch(() => []),
  ])
  occupancy.value = occ
  debtorsSummary.value = debtSummary
  topDebtors.value = (debtRows?.data ?? []).filter((r) => r.totalBalance > 0)
  contractsSummary.value = regSummary
  topExpiring.value = expiringRows?.data ?? []
  unreadChatsCount.value = conversations.filter((c) => c.unread).length
  isLoading.value = false
})

interface AttentionRow {
  key: string
  icon: typeof Clock
  iconClass: string
  title: string
  subtitle: string
  to: string
}

const attentionRows = computed<AttentionRow[]>(() => {
  const rows: AttentionRow[] = topExpiring.value.map((c) => ({
    key: `expiring-${c.contractId}`,
    icon: Clock,
    iconClass: 'text-orange-500',
    title: t('home.attentionContractLine', { number: c.contractNumber, name: c.residentFullName }),
    subtitle: t('reports.registry.expiringLabel', { days: c.daysUntilEnd }),
    to: `/contracts/${c.contractId}`,
  }))
  rows.push(
    ...topDebtors.value.map((d) => ({
      key: `debtor-${d.contractId}`,
      icon: AlertTriangle,
      iconClass: 'text-red-500',
      title: t('home.attentionDebtorLine', { name: d.residentFullName, room: d.room ?? '—' }),
      subtitle: formatMoney(d.totalBalance),
      to: `/contracts/${d.contractId}`,
    })),
  )
  if (unreadChatsCount.value > 0) {
    rows.push({
      key: 'unread-chats',
      icon: MessageCircle,
      iconClass: 'text-primary',
      title: t('home.attentionUnreadChats', { count: unreadChatsCount.value }),
      subtitle: t('home.attentionUnreadChatsHint'),
      to: '/chats',
    })
  }
  return rows
})

const individualDialogRef = ref<InstanceType<typeof CreateIndividualDialog> | null>(null)
const contractDialogRef = ref<InstanceType<typeof CreateContractDialog> | null>(null)
</script>

<template>
  <div class="flex flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <RouterLink to="/reports/occupancy" class="rounded-lg bg-muted/50 p-4 transition-colors hover:bg-muted">
        <div class="flex items-center gap-1.5 text-sm text-muted-foreground">
          <DoorOpen class="size-4 shrink-0 text-primary" />
          {{ t('home.kpiRooms') }}
        </div>
        <p class="mt-1 text-2xl font-semibold tabular-nums">
          {{ isLoading ? '—' : t('home.kpiRoomsValue', { occupied: occupancy?.occupied ?? 0, total: occupancy?.totalPlaces ?? 0 }) }}
        </p>
      </RouterLink>

      <RouterLink to="/reports/contracts" class="rounded-lg bg-muted/50 p-4 transition-colors hover:bg-muted">
        <div class="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock class="size-4 shrink-0 text-orange-500" />
          {{ t('home.kpiExpiring') }}
        </div>
        <p class="mt-1 text-2xl font-semibold tabular-nums">{{ isLoading ? '—' : (contractsSummary?.expiring30 ?? 0) }}</p>
      </RouterLink>

      <RouterLink to="/reports/debt" class="rounded-lg bg-muted/50 p-4 transition-colors hover:bg-muted">
        <div class="flex items-center gap-1.5 text-sm text-muted-foreground">
          <AlertTriangle class="size-4 shrink-0 text-red-500" />
          {{ t('home.kpiDebtors') }}
        </div>
        <p class="mt-1 text-2xl font-semibold tabular-nums">{{ isLoading ? '—' : (debtorsSummary?.debtorsCount ?? 0) }}</p>
        <p v-if="!isLoading && debtorsSummary" class="text-xs text-muted-foreground">{{ formatMoney(debtorsSummary.totalDebt) }}</p>
      </RouterLink>

      <RouterLink to="/chats" class="rounded-lg bg-muted/50 p-4 transition-colors hover:bg-muted">
        <div class="flex items-center gap-1.5 text-sm text-muted-foreground">
          <MessageCircle class="size-4 shrink-0 text-primary" />
          {{ t('home.kpiUnread') }}
        </div>
        <p class="mt-1 text-2xl font-semibold tabular-nums">{{ isLoading ? '—' : unreadChatsCount }}</p>
      </RouterLink>
    </div>

    <div class="flex flex-wrap gap-2">
      <Button size="sm" class="flex items-center gap-2" @click="individualDialogRef?.open()">
        <UserPlus class="size-4 shrink-0" />
        {{ t('home.quickNewIndividual') }}
      </Button>
      <Button size="sm" variant="outline" class="flex items-center gap-2" @click="contractDialogRef?.open()">
        <FileSignature class="size-4 shrink-0" />
        {{ t('home.quickNewContract') }}
      </Button>
      <CreateIndividualDialog ref="individualDialogRef" />
      <CreateContractDialog ref="contractDialogRef" />
    </div>

    <Card class="p-4">
      <div class="mb-3 flex items-center gap-1.5 text-sm font-medium">
        <AlertTriangle class="size-4 text-primary" />
        {{ t('home.attentionTitle') }}
      </div>
      <p v-if="isLoading" class="text-sm text-muted-foreground">{{ t('entityTable.loading') }}</p>
      <p v-else-if="!attentionRows.length" class="text-sm text-muted-foreground">{{ t('home.attentionEmpty') }}</p>
      <div v-else class="flex flex-col divide-y divide-border">
        <RouterLink
          v-for="row in attentionRows"
          :key="row.key"
          :to="row.to"
          class="-mx-2 flex items-center gap-3 rounded-md px-2 py-2 hover:bg-accent"
        >
          <component :is="row.icon" class="size-4 shrink-0" :class="row.iconClass" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm">{{ row.title }}</p>
            <p class="text-xs text-muted-foreground">{{ row.subtitle }}</p>
          </div>
        </RouterLink>
      </div>
    </Card>
  </div>
</template>
