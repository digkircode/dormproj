<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { AlertTriangle, CalendarX, Clock, DoorOpen, FileSignature, Megaphone, MessageCircle, MoreVertical, Newspaper, Pencil, Trash2, UserPlus } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import CreateIndividualDialog from '@/components/CreateIndividualDialog.vue'
import CreateContractDialog from '@/components/CreateContractDialog.vue'
import AnnouncementDialog from '@/components/AnnouncementDialog.vue'
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
import { fetchAnnouncements, deleteAnnouncement, type StaffAnnouncement } from '@/lib/announcements-api'
import { fetchContractsPage, type ContractListItem } from '@/lib/contracts-api'
import { dateLocaleTag, todayIso } from '@/lib/format-locale'
import { iconBadgeColorClasses } from '@/lib/avatar-color'
import { parseApiError } from '@/lib/utils'

const { t } = useI18n()

// Тот же fade-переход открытия/закрытия, что у остальных диалогов (CreateIndividualDialog.vue).
const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'

// Главная для роли STAFF/ADMIN (см. Home.vue) — вместо моков (StatCard/AreaChart/DataTable,
// удалены) реальные плашки поверх уже существующих отчётных эндпоинтов, ничего нового на
// бэкенде заводить не пришлось (по прямой просьбе 2026-08-27).
const occupancy = ref<OccupancyReport | null>(null)
const debtorsSummary = ref<DebtorsSummary | null>(null)
const topDebtors = ref<DebtorRow[]>([])
const contractsSummary = ref<ContractsRegistrySummary | null>(null)
const topExpiring = ref<ContractRegistryRow[]>([])
const topOverdue = ref<ContractListItem[]>([])
const overdueCount = ref(0)
const unreadChatsCount = ref(0)
type DashboardSource = 'occupancy' | 'debtSummary' | 'debtRows' | 'contractsSummary' | 'expiring' | 'overdue' | 'conversations'
type LoadState = 'loading' | 'success' | 'error'
const sourceState = ref<Record<DashboardSource, LoadState>>({
  occupancy: 'loading', debtSummary: 'loading', debtRows: 'loading', contractsSummary: 'loading',
  expiring: 'loading', overdue: 'loading', conversations: 'loading',
})
const announcements = ref<StaffAnnouncement[]>([])
const announcementsState = ref<LoadState>('loading')
const attentionSources: DashboardSource[] = ['debtRows', 'expiring', 'overdue', 'conversations']
const attentionLoading = computed(() => attentionSources.some((key) => sourceState.value[key] === 'loading'))
const attentionIncomplete = computed(() => attentionSources.some((key) => sourceState.value[key] === 'error'))

function rememberedRowCount(key: string, fallback: number): number {
  try {
    const stored = Number(localStorage.getItem(key))
    return Number.isInteger(stored) && stored > 0 ? Math.min(stored, 100) : fallback
  } catch {
    return fallback
  }
}
function rememberRowCount(key: string, count: number) {
  try { localStorage.setItem(key, String(Math.max(1, count))) } catch { /* Storage can be disabled. */ }
}
const attentionSkeletonRows = ref(rememberedRowCount('home-attention-rows', 6))
const announcementsSkeletonRows = ref(rememberedRowCount('home-announcement-rows', 3))

async function loadSource<T>(key: DashboardSource, request: Promise<T>, assign: (value: T) => void) {
  try {
    assign(await request)
    sourceState.value[key] = 'success'
  } catch {
    sourceState.value[key] = 'error'
  }
}

function formatMoney(value: number): string {
  return `${value.toLocaleString(dateLocaleTag(), { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`
}
function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(dateLocaleTag())
}

onMounted(() => {
  const asOf = todayIso()
  // pageSize 3 (было 4) — по прямой просьбе 2026-08-30, после того как "Требует внимания"
  // и "Объявления" встали бок о бок (см. template) карточка стала уже, 4 строки уже не
  // помещались так же комфортно, как раньше в полную ширину.
  const baseListOptions = { page: 1, pageSize: 3, search: '' }
  void Promise.all([
    loadSource('occupancy', fetchOccupancy(), (value) => { occupancy.value = value }),
    loadSource('debtSummary', fetchDebtorsSummary(asOf), (value) => { debtorsSummary.value = value }),
    loadSource('debtRows', fetchDebtorsPage({ ...baseListOptions, sortBy: 'totalBalance', sortDir: 'desc', filters: {} }, asOf), (value) => { topDebtors.value = value.data.filter((r) => r.totalBalance > 0) }),
    loadSource('contractsSummary', fetchContractsRegistrySummary(asOf), (value) => { contractsSummary.value = value }),
    loadSource('expiring', fetchContractsRegistryPage({ ...baseListOptions, sortBy: 'endDate', sortDir: 'asc', filters: { bucket: ['EXPIRING'] } }, asOf), (value) => { topExpiring.value = value.data }),
    loadSource('overdue', fetchContractsPage({ ...baseListOptions, sortBy: 'endDate', sortDir: 'asc', filters: { status: ['OVERDUE'] } }), (value) => {
      topOverdue.value = value.data
      overdueCount.value = value.total
    }),
    loadSource('conversations', fetchConversations(), (value) => { unreadChatsCount.value = value.filter((c) => c.unread).length }),
  ])
})

// Объявления — отдельным запросом (не в общий Promise.all выше, чтобы падение одного не
// задерживало остальные плашки визуально) — по прямой просьбе 2026-08-30.
async function loadAnnouncements() {
  announcementsState.value = 'loading'
  try {
    announcements.value = await fetchAnnouncements()
    announcementsState.value = 'success'
    announcementsSkeletonRows.value = Math.max(1, announcements.value.length)
    rememberRowCount('home-announcement-rows', announcements.value.length)
  } catch {
    announcementsState.value = 'error'
  }
}
onMounted(loadAnnouncements)

const announcementDialogRef = ref<InstanceType<typeof AnnouncementDialog> | null>(null)
const deleteAnnouncementTarget = ref<StaffAnnouncement | null>(null)
const isDeletingAnnouncement = ref(false)
const deleteAnnouncementError = ref('')

async function confirmDeleteAnnouncement() {
  if (!deleteAnnouncementTarget.value) return
  isDeletingAnnouncement.value = true
  deleteAnnouncementError.value = ''
  try {
    await deleteAnnouncement(deleteAnnouncementTarget.value.id)
    deleteAnnouncementTarget.value = null
    await loadAnnouncements()
  } catch (error) {
    deleteAnnouncementError.value = parseApiError(error).message
  } finally {
    isDeletingAnnouncement.value = false
  }
}

interface AttentionRow {
  key: string
  icon: typeof Clock
  iconClass: string
  title: string
  subtitle: string
  to: string
}

// Порядок — тот же приоритет, что и у плашек выше (Должники → Просроченные →
// Истекающие), по прямой просьбе 2026-09-05.
const attentionRows = computed<AttentionRow[]>(() => {
  const rows: AttentionRow[] = topDebtors.value.map((d) => ({
    key: `debtor-${d.contractId}`,
    icon: AlertTriangle,
    iconClass: 'text-red-500',
    title: t('home.attentionDebtorLine', { name: d.residentFullName, room: d.room ?? '-' }),
    subtitle: formatMoney(d.totalBalance),
    to: `/contracts/${d.contractId}`,
  }))
  rows.push(
    ...topOverdue.value.map((c) => ({
      key: `overdue-${c.id}`,
      icon: CalendarX,
      iconClass: 'text-rose-500',
      title: t('home.attentionContractLine', { number: c.number, name: c.residentFullName }),
      subtitle: t('reports.registry.overdueLabel', { days: Math.max(0, Math.round((new Date(todayIso()).getTime() - new Date(c.endDate).getTime()) / 86_400_000)) }),
      to: `/contracts/${c.id}`,
    })),
  )
  rows.push(
    ...topExpiring.value.map((c) => ({
      key: `expiring-${c.contractId}`,
      icon: Clock,
      iconClass: 'text-orange-500',
      title: t('home.attentionContractLine', { number: c.contractNumber, name: c.residentFullName }),
      subtitle: t('reports.registry.expiringLabel', { days: c.daysUntilEnd }),
      to: `/contracts/${c.contractId}`,
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

watch(attentionLoading, (loading) => {
  if (loading || attentionIncomplete.value) return
  attentionSkeletonRows.value = Math.max(1, attentionRows.value.length)
  rememberRowCount('home-attention-rows', attentionRows.value.length)
})

const individualDialogRef = ref<InstanceType<typeof CreateIndividualDialog> | null>(null)
const contractDialogRef = ref<InstanceType<typeof CreateContractDialog> | null>(null)
</script>

<template>
  <div class="flex flex-1 flex-col gap-4 p-4 md:p-6">
    <!-- Порядок — Комнаты, Должники, Просроченные, Истекающие, Непрочитанные (по прямой
         просьбе 2026-09-05, было Комнаты/Истекающие/Должники/Непрочитанные). Должники/
         Просроченные/Истекающие ведут на соответствующий отчёт уже с применённым фильтром
         (?hasDebt=YES / ?status=OVERDUE / ?bucket=EXPIRING), а не просто на пустой список. -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <RouterLink
        to="/reports/occupancy"
        class="rounded-lg bg-blue-50 p-4 transition-colors hover:bg-blue-100 dark:bg-blue-500/10 dark:hover:bg-blue-500/15"
      >
        <div class="flex items-center gap-1.5 text-sm text-muted-foreground">
          <DoorOpen class="size-4 shrink-0 text-blue-600 dark:text-blue-400" />
          {{ t('home.kpiRooms') }}
        </div>
        <div v-if="sourceState.occupancy === 'loading'" class="mt-1 h-8 w-28 animate-pulse rounded bg-muted motion-reduce:animate-none" aria-hidden="true" />
        <p v-else-if="sourceState.occupancy === 'error'" class="mt-1 flex min-h-8 items-center text-sm text-destructive">{{ t('home.dataUnavailable') }}</p>
        <p v-else class="data-reveal mt-1 min-h-8 text-2xl font-semibold tabular-nums">{{ t('home.kpiRoomsValue', { occupied: occupancy!.occupied, total: occupancy!.totalPlaces }) }}</p>
      </RouterLink>

      <RouterLink
        to="/reports/debt?hasDebt=YES"
        class="rounded-lg bg-red-50 p-4 transition-colors hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/15"
      >
        <div class="flex items-center gap-1.5 text-sm text-muted-foreground">
          <AlertTriangle class="size-4 shrink-0 text-red-600 dark:text-red-400" />
          {{ t('home.kpiDebtors') }}
        </div>
        <div v-if="sourceState.debtSummary === 'loading'" class="mt-1 h-8 w-20 animate-pulse rounded bg-muted motion-reduce:animate-none" aria-hidden="true" />
        <p v-else-if="sourceState.debtSummary === 'error'" class="mt-1 flex min-h-8 items-center text-sm text-destructive">{{ t('home.dataUnavailable') }}</p>
        <p v-else class="data-reveal mt-1 min-h-8 text-2xl font-semibold tabular-nums">{{ debtorsSummary!.debtorsCount }}</p>
        <p class="min-h-4 text-xs text-muted-foreground">{{ sourceState.debtSummary === 'success' ? formatMoney(debtorsSummary!.totalDebt) : '' }}</p>
      </RouterLink>

      <RouterLink
        to="/contracts?status=OVERDUE"
        class="rounded-lg bg-rose-50 p-4 transition-colors hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/15"
      >
        <div class="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarX class="size-4 shrink-0 text-rose-600 dark:text-rose-400" />
          {{ t('home.kpiOverdue') }}
        </div>
        <div v-if="sourceState.overdue === 'loading'" class="mt-1 h-8 w-20 animate-pulse rounded bg-muted motion-reduce:animate-none" aria-hidden="true" />
        <p v-else-if="sourceState.overdue === 'error'" class="mt-1 flex min-h-8 items-center text-sm text-destructive">{{ t('home.dataUnavailable') }}</p>
        <p v-else class="data-reveal mt-1 min-h-8 text-2xl font-semibold tabular-nums">{{ overdueCount }}</p>
      </RouterLink>

      <RouterLink
        to="/reports/contracts?bucket=EXPIRING"
        class="rounded-lg bg-orange-50 p-4 transition-colors hover:bg-orange-100 dark:bg-orange-500/10 dark:hover:bg-orange-500/15"
      >
        <div class="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock class="size-4 shrink-0 text-orange-600 dark:text-orange-400" />
          {{ t('home.kpiExpiring') }}
        </div>
        <div v-if="sourceState.contractsSummary === 'loading'" class="mt-1 h-8 w-20 animate-pulse rounded bg-muted motion-reduce:animate-none" aria-hidden="true" />
        <p v-else-if="sourceState.contractsSummary === 'error'" class="mt-1 flex min-h-8 items-center text-sm text-destructive">{{ t('home.dataUnavailable') }}</p>
        <p v-else class="data-reveal mt-1 min-h-8 text-2xl font-semibold tabular-nums">{{ contractsSummary!.expiring30 }}</p>
      </RouterLink>

      <RouterLink
        to="/chats"
        class="rounded-lg bg-violet-50 p-4 transition-colors hover:bg-violet-100 dark:bg-violet-500/10 dark:hover:bg-violet-500/15"
      >
        <div class="flex items-center gap-1.5 text-sm text-muted-foreground">
          <MessageCircle class="size-4 shrink-0 text-violet-600 dark:text-violet-400" />
          {{ t('home.kpiUnread') }}
        </div>
        <div v-if="sourceState.conversations === 'loading'" class="mt-1 h-8 w-20 animate-pulse rounded bg-muted motion-reduce:animate-none" aria-hidden="true" />
        <p v-else-if="sourceState.conversations === 'error'" class="mt-1 flex min-h-8 items-center text-sm text-destructive">{{ t('home.dataUnavailable') }}</p>
        <p v-else class="data-reveal mt-1 min-h-8 text-2xl font-semibold tabular-nums">{{ unreadChatsCount }}</p>
      </RouterLink>
    </div>

    <!-- Нейтральные кнопки (по прямой просьбе 2026-08-27) — иконка остаётся primary,
         сама кнопка больше не акцентная, чтобы не спорить за внимание с KPI-плашками выше. -->
    <div class="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" class="flex items-center gap-2" @click="individualDialogRef?.open()">
        <UserPlus class="size-4 shrink-0 text-primary" />
        {{ t('home.quickNewIndividual') }}
      </Button>
      <Button size="sm" variant="outline" class="flex items-center gap-2" @click="contractDialogRef?.open()">
        <FileSignature class="size-4 shrink-0 text-primary" />
        {{ t('home.quickNewContract') }}
      </Button>
      <Button size="sm" variant="outline" class="flex items-center gap-2" @click="announcementDialogRef?.open()">
        <Megaphone class="size-4 shrink-0 text-primary" />
        {{ t('home.quickNewAnnouncement') }}
      </Button>
      <CreateIndividualDialog ref="individualDialogRef" />
      <CreateContractDialog ref="contractDialogRef" />
      <AnnouncementDialog ref="announcementDialogRef" @saved="loadAnnouncements" />
    </div>

    <!-- "Требует внимания" и "Объявления" — по прямой просьбе 2026-08-30 бок о бок
         (было друг под другом), тот же grid-паттерн, что у пар карточек на
         ResidentHomeDashboard.vue (Мой договор/Оплата, Чат/Контакты). -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Card class="min-w-0 p-4">
        <div class="mb-3 flex items-center gap-1.5 text-sm font-medium">
          <AlertTriangle class="size-4 text-primary" />
          {{ t('home.attentionTitle') }}
        </div>
        <div v-if="attentionLoading" class="flex flex-col divide-y divide-border" aria-hidden="true">
          <div v-for="n in attentionSkeletonRows" :key="n" class="flex min-h-[52px] items-center gap-3 px-2 py-2">
            <div class="size-4 shrink-0 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div class="min-w-0 flex-1 space-y-1"><div class="h-5 w-3/4 animate-pulse rounded bg-muted motion-reduce:animate-none" /><div class="h-3 w-1/3 animate-pulse rounded bg-muted motion-reduce:animate-none" /></div>
          </div>
        </div>
        <p v-else-if="!attentionRows.length && attentionIncomplete" class="flex min-h-[52px] items-center text-sm text-destructive">{{ t('home.dataUnavailable') }}</p>
        <p v-else-if="!attentionRows.length" class="flex min-h-[52px] items-center text-sm text-muted-foreground">{{ t('home.attentionEmpty') }}</p>
        <div v-else class="data-reveal flex flex-col divide-y divide-border">
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
        <p v-if="!attentionLoading && attentionRows.length && attentionIncomplete" class="mt-2 text-xs text-destructive">{{ t('home.attentionIncomplete') }}</p>
      </Card>

      <!-- Объявления — по прямой просьбе 2026-08-30. Иконка каждой строки — свой цвет по
           хэшу id (iconBadgeColorClasses, тот же приём, что у аватарок в чате), не путать с
           фиксированной фиолетовой иконкой на резидентской карточке (ResidentHomeDashboard.vue) —
           там весь БЛОК один, тут список из МНОГИХ объявлений. -->
      <Card class="min-w-0 p-4">
        <div class="mb-3 flex items-center gap-1.5 text-sm font-medium">
          <Megaphone class="size-4 text-primary" />
          {{ t('home.staffAnnouncementsTitle') }}
        </div>
        <div v-if="announcementsState === 'loading'" class="flex flex-col divide-y divide-border" aria-hidden="true">
          <div v-for="n in announcementsSkeletonRows" :key="n" class="relative flex min-h-[68px] items-start gap-3 px-2 py-2 pb-6">
            <div class="size-8 shrink-0 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
            <div class="min-w-0 flex-1 space-y-1"><div class="h-5 w-2/3 animate-pulse rounded bg-muted motion-reduce:animate-none" /><div class="h-3 w-full animate-pulse rounded bg-muted motion-reduce:animate-none" /></div>
            <div class="absolute right-2 bottom-1 h-3 w-24 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          </div>
        </div>
        <p v-else-if="announcementsState === 'error'" class="flex min-h-[68px] items-center text-sm text-destructive">{{ t('home.dataUnavailable') }}</p>
        <p v-else-if="!announcements.length" class="flex min-h-[68px] items-center text-sm text-muted-foreground">{{ t('home.staffAnnouncementsEmpty') }}</p>
        <div v-else class="data-reveal flex flex-col divide-y divide-border">
          <!-- pb-6 + relative — освобождает место под ФИО/дату, притянутые в правый нижний
               угол абсолютным позиционированием (по прямой просьбе 2026-08-30, было третьей
               строкой в текстовом столбце). Кебаб-меню остаётся в потоке (верх строки), с
               подписью в углу не пересекается — она ниже и у правого края. -->
          <div v-for="a in announcements" :key="a.id" class="relative -mx-2 flex items-start gap-3 rounded-md px-2 py-2 pb-6">
            <div class="flex size-8 shrink-0 items-center justify-center rounded-lg" :class="iconBadgeColorClasses(a.id).container">
              <Newspaper class="size-4" :class="iconBadgeColorClasses(a.id).icon" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{{ a.title }}</p>
              <p class="truncate text-xs text-muted-foreground">{{ a.body }}</p>
            </div>
            <p class="absolute right-2 bottom-1 text-xs text-muted-foreground">{{ a.authorFullName }} · {{ formatDate(a.createdAt) }}</p>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="ghost" size="icon" class="size-7 shrink-0">
                  <MoreVertical class="size-4" />
                  <span class="sr-only">{{ a.title }}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem @click="announcementDialogRef?.open(a)">
                  <Pencil class="text-primary" />
                  {{ t('announcements.edit') }}
                </DropdownMenuItem>
                <DropdownMenuItem class="text-red-500" @click="deleteAnnouncementTarget = a">
                  <Trash2 class="text-red-500" />
                  {{ t('announcements.delete') }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </Card>
    </div>

    <!-- Подтверждение удаления объявления — тот же паттерн, что и у удаления комнаты
         (RoomDetailPanel.vue): обычный Dialog с Cancel/Delete, без отдельного
         AlertDialog-компонента (в проекте такого нет). -->
    <Dialog :open="!!deleteAnnouncementTarget" @update:open="(v) => { if (!v) deleteAnnouncementTarget = null }">
      <DialogScrollContent :class="['flex flex-col gap-4', DIALOG_ANIMATE_CLASS]">
        <DialogHeader>
          <DialogTitle>{{ t('announcements.deleteDialog.title') }}</DialogTitle>
          <DialogDescription>{{ t('announcements.deleteDialog.description') }}</DialogDescription>
        </DialogHeader>
        <p v-if="deleteAnnouncementError" class="text-sm text-red-500">{{ deleteAnnouncementError }}</p>
        <DialogFooter>
          <Button variant="outline" @click="deleteAnnouncementTarget = null">{{ t('announcements.deleteDialog.cancel') }}</Button>
          <Button
            variant="outline"
            class="border-red-500 text-red-500 hover:text-red-500"
            :loading="isDeletingAnnouncement"
            @click="confirmDeleteAnnouncement"
          >
            {{ t('announcements.deleteDialog.confirm') }}
          </Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>
  </div>
</template>
