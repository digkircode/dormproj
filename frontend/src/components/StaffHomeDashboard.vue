<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { AlertTriangle, Clock, DoorOpen, FileSignature, Megaphone, MessageCircle, MoreVertical, Newspaper, Pencil, Trash2, UserPlus } from 'lucide-vue-next'
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
const unreadChatsCount = ref(0)
const isLoading = ref(true)
const announcements = ref<StaffAnnouncement[]>([])
const isAnnouncementsLoading = ref(true)

function formatMoney(value: number): string {
  return `${value.toLocaleString(dateLocaleTag(), { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`
}
function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(dateLocaleTag())
}

onMounted(async () => {
  const asOf = todayIso()
  // pageSize 3 (было 4) — по прямой просьбе 2026-08-30, после того как "Требует внимания"
  // и "Объявления" встали бок о бок (см. template) карточка стала уже, 4 строки уже не
  // помещались так же комфортно, как раньше в полную ширину.
  const baseListOptions = { page: 1, pageSize: 3, search: '' }
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

// Объявления — отдельным запросом (не в общий Promise.all выше, чтобы падение одного не
// задерживало остальные плашки визуально) — по прямой просьбе 2026-08-30.
async function loadAnnouncements() {
  isAnnouncementsLoading.value = true
  announcements.value = await fetchAnnouncements().catch(() => [])
  isAnnouncementsLoading.value = false
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
      <RouterLink
        to="/reports/occupancy"
        class="rounded-lg bg-blue-50 p-4 transition-colors hover:bg-blue-100 dark:bg-blue-500/10 dark:hover:bg-blue-500/15"
      >
        <div class="flex items-center gap-1.5 text-sm text-muted-foreground">
          <DoorOpen class="size-4 shrink-0 text-blue-600 dark:text-blue-400" />
          {{ t('home.kpiRooms') }}
        </div>
        <p class="mt-1 text-2xl font-semibold tabular-nums">
          {{ isLoading ? '—' : t('home.kpiRoomsValue', { occupied: occupancy?.occupied ?? 0, total: occupancy?.totalPlaces ?? 0 }) }}
        </p>
      </RouterLink>

      <RouterLink
        to="/reports/contracts"
        class="rounded-lg bg-orange-50 p-4 transition-colors hover:bg-orange-100 dark:bg-orange-500/10 dark:hover:bg-orange-500/15"
      >
        <div class="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock class="size-4 shrink-0 text-orange-600 dark:text-orange-400" />
          {{ t('home.kpiExpiring') }}
        </div>
        <p class="mt-1 text-2xl font-semibold tabular-nums">{{ isLoading ? '—' : (contractsSummary?.expiring30 ?? 0) }}</p>
      </RouterLink>

      <RouterLink
        to="/reports/debt"
        class="rounded-lg bg-red-50 p-4 transition-colors hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/15"
      >
        <div class="flex items-center gap-1.5 text-sm text-muted-foreground">
          <AlertTriangle class="size-4 shrink-0 text-red-600 dark:text-red-400" />
          {{ t('home.kpiDebtors') }}
        </div>
        <p class="mt-1 text-2xl font-semibold tabular-nums">{{ isLoading ? '—' : (debtorsSummary?.debtorsCount ?? 0) }}</p>
        <p v-if="!isLoading && debtorsSummary" class="text-xs text-muted-foreground">{{ formatMoney(debtorsSummary.totalDebt) }}</p>
      </RouterLink>

      <RouterLink
        to="/chats"
        class="rounded-lg bg-violet-50 p-4 transition-colors hover:bg-violet-100 dark:bg-violet-500/10 dark:hover:bg-violet-500/15"
      >
        <div class="flex items-center gap-1.5 text-sm text-muted-foreground">
          <MessageCircle class="size-4 shrink-0 text-violet-600 dark:text-violet-400" />
          {{ t('home.kpiUnread') }}
        </div>
        <p class="mt-1 text-2xl font-semibold tabular-nums">{{ isLoading ? '—' : unreadChatsCount }}</p>
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

      <!-- Объявления — по прямой просьбе 2026-08-30. Иконка каждой строки — свой цвет по
           хэшу id (iconBadgeColorClasses, тот же приём, что у аватарок в чате), не путать с
           фиксированной фиолетовой иконкой на резидентской карточке (ResidentHomeDashboard.vue) —
           там весь БЛОК один, тут список из МНОГИХ объявлений. -->
      <Card class="p-4">
        <div class="mb-3 flex items-center gap-1.5 text-sm font-medium">
          <Megaphone class="size-4 text-primary" />
          {{ t('home.staffAnnouncementsTitle') }}
        </div>
        <p v-if="isAnnouncementsLoading" class="text-sm text-muted-foreground">{{ t('entityTable.loading') }}</p>
        <p v-else-if="!announcements.length" class="text-sm text-muted-foreground">{{ t('home.staffAnnouncementsEmpty') }}</p>
        <div v-else class="flex flex-col divide-y divide-border">
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
