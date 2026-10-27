<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowRight, CreditCard, DoorOpen, Megaphone, Newspaper, Wallet } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import CreatePaymentDialog from '@/components/CreatePaymentDialog.vue'
import AnnouncementReadDialog from '@/components/AnnouncementReadDialog.vue'
import AllAnnouncementsDialog from '@/components/AllAnnouncementsDialog.vue'
import ResidentNotificationsCard from '@/components/ResidentNotificationsCard.vue'
import { fetchMyContractHomeSummary, type MyContractHomeSummary } from '@/lib/contracts-api'
import { fetchMyAnnouncements, type ResidentAnnouncement } from '@/lib/announcements-api'
import { currentUser } from '@/lib/auth-state'
import { dateLocaleTag } from '@/lib/format-locale'
import { iconBadgeColorClasses } from '@/lib/avatar-color'
import mascotSrc from '@/assets/mascot.webp'

const { t } = useI18n()

const props = defineProps<{
  demo?: boolean
  demoContract?: MyContractHomeSummary | null
  demoAnnouncements?: ResidentAnnouncement[]
}>()

const contract = ref<MyContractHomeSummary | null>(null)
type LoadState = 'loading' | 'success' | 'error'
const contractState = ref<LoadState>('loading')
const announcementsState = ref<LoadState>('loading')
const paymentDialog = ref<InstanceType<typeof CreatePaymentDialog> | null>(null)
const firstName = computed(() => currentUser.value?.name || null)

const announcements = ref<ResidentAnnouncement[]>([])
const ANNOUNCEMENTS_PREVIEW_COUNT = 2
const announcementsPreview = computed(() => announcements.value.slice(0, ANNOUNCEMENTS_PREVIEW_COUNT))
const announcementReadDialog = ref<InstanceType<typeof AnnouncementReadDialog> | null>(null)
const allAnnouncementsDialog = ref<InstanceType<typeof AllAnnouncementsDialog> | null>(null)

function markAnnouncementAsRead(id: number) {
  const found = announcements.value.find((a) => a.id === id)
  if (found) found.unread = false
}

onMounted(() => {
  if (props.demo) {
    contract.value = props.demoContract ?? null
    announcements.value = props.demoAnnouncements ?? []
    contractState.value = 'success'
    announcementsState.value = 'success'
    return
  }
  void fetchMyContractHomeSummary().then((value) => {
    contract.value = value
    contractState.value = 'success'
  }).catch(() => { contractState.value = 'error' })
  void fetchMyAnnouncements().then((value) => {
    announcements.value = value
    announcementsState.value = 'success'
  }).catch(() => { announcementsState.value = 'error' })
})

const overdueBalance = computed(() => contract.value?.overdueBalance ?? 0)
const nextAccrual = computed(() => contract.value?.nextAccrual ?? null)

function formatMoney(value: number): string {
  return `${value.toLocaleString(dateLocaleTag(), { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`
}
function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(dateLocaleTag())
}
</script>

<template>
  <div class="flex min-w-0 flex-1 flex-col gap-3 p-3 sm:gap-4 sm:p-4 md:p-6">
    <Card class="relative flex flex-col items-start gap-3 overflow-hidden px-5 pt-5 sm:gap-4 sm:px-10 sm:pt-6 lg:flex-row lg:items-center lg:gap-8 lg:px-[80px]">
      <div class="pointer-events-none absolute inset-0" aria-hidden="true">
        <div class="absolute top-[8%] left-[6%] aspect-square w-[6%] rounded-full bg-sky-100 dark:bg-sky-400/15" />
        <div class="absolute top-[38%] left-[16%] aspect-square w-[4%] rounded-full bg-sky-100 dark:bg-sky-400/15" />
        <div class="absolute bottom-[10%] left-[28%] aspect-square w-[8%] rounded-full bg-sky-100 dark:bg-sky-400/15" />
        <div class="absolute top-[14%] left-[38%] aspect-square w-[5%] rounded-full bg-sky-100 dark:bg-sky-400/15" />
        <div class="absolute bottom-[30%] left-[46%] aspect-square w-[10%] rounded-full bg-sky-100 dark:bg-sky-400/15" />
        <div class="absolute top-[4%] right-[38%] aspect-square w-[7%] rounded-full bg-sky-100 dark:bg-sky-400/15" />
        <div class="absolute bottom-[6%] right-[30%] aspect-square w-[13%] rounded-full bg-sky-100 dark:bg-sky-400/15" />
        <div class="absolute top-[22%] right-[24%] aspect-square w-[6%] rounded-full bg-sky-100 dark:bg-sky-400/15" />
        <div class="absolute -bottom-[4%] right-[18%] aspect-square w-[16%] rounded-full bg-sky-100 dark:bg-sky-400/15" />
        <div class="absolute top-[2%] right-[14%] aspect-square w-[9%] rounded-full bg-sky-100 dark:bg-sky-400/15" />
        <div class="absolute bottom-[42%] right-[10%] aspect-square w-[5%] rounded-full bg-sky-100 dark:bg-sky-400/15" />
        <div class="absolute -right-[4%] bottom-[16%] aspect-square w-[14%] rounded-full bg-sky-100 dark:bg-sky-400/15" />
        <div class="absolute -right-[3%] -bottom-[6%] aspect-square w-[18%] rounded-full bg-sky-100 dark:bg-sky-400/15" />
        <div class="absolute -top-[3%] -right-[2%] aspect-square w-[11%] rounded-full bg-sky-100 dark:bg-sky-400/15" />
        <div class="absolute top-[46%] -right-[2%] aspect-square w-[7%] rounded-full bg-sky-100 dark:bg-sky-400/15" />
      </div>

      <div class="relative z-10 w-full max-w-xl min-w-0">
        <h1 class="break-words text-xl font-semibold leading-tight sm:text-2xl">
          <span class="font-emoji">👋</span>
          {{ firstName ? t('home.resident.greetingTitle', { name: firstName }) : t('home.resident.greetingTitleFallback') }}
        </h1>
        <p class="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">{{ t('home.resident.greetingBody1') }}</p>
        <p class="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">{{ t('home.resident.greetingBody2') }}</p>
        <div class="mt-4">
          <Button @click="paymentDialog?.open()">
            <CreditCard class="size-4" />
            {{ t('home.resident.payHero') }}
          </Button>
        </div>
      </div>

      <div class="relative z-10 flex shrink-0 self-end items-center gap-1 lg:ml-auto lg:self-auto">
        <div class="relative hidden max-w-[220px] rounded-2xl border bg-background px-3 py-2 text-base shadow-sm lg:block">
          {{ t('home.resident.mascotBubble') }}
          <span class="absolute top-1/2 -right-1.5 size-3 -translate-y-1/2 rotate-45 border-t border-r bg-background" />
        </div>
        <div class="relative h-[120px] -translate-x-2 overflow-hidden sm:h-[240px] sm:-translate-x-3 lg:h-[326px]">
          <img :src="mascotSrc" alt="" class="h-[135px] w-auto sm:h-[267px] lg:h-[363px]" />
        </div>
      </div>
      <CreatePaymentDialog ref="paymentDialog" />
    </Card>

    <div class="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
      <Card class="flex min-w-0 flex-col gap-3 rounded-2xl border-0 p-3 sm:p-4">
        <div class="flex items-start gap-3">
          <div class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky-100 dark:bg-sky-500/20">
            <DoorOpen class="size-4 text-sky-600 dark:text-sky-400" />
          </div>
          <div class="min-w-0">
            <h2 class="text-sm font-semibold leading-5">{{ t('home.resident.roomHeading') }}</h2>
            <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">{{ t('home.resident.roomTagline') }}</p>
          </div>
        </div>
        <div v-if="contractState === 'loading'" class="space-y-3" aria-hidden="true"><div v-for="n in 3" :key="n" class="h-8 animate-pulse rounded bg-muted motion-reduce:animate-none" /></div>
        <p v-else-if="contractState === 'error'" class="text-sm text-destructive">{{ t('home.dataUnavailable') }}</p>
        <template v-else-if="contract?.currentRoom">
          <div class="flex min-w-0 divide-x text-sm max-[359px]:flex-col max-[359px]:gap-3 max-[359px]:divide-x-0">
            <div class="flex min-w-0 flex-1 flex-col gap-3 pr-4 max-[359px]:pr-0">
              <div>
                <p class="text-xs text-muted-foreground">{{ t('home.resident.roomNumberLabel') }}</p>
                <p class="break-all font-medium">{{ contract.currentRoom.room }}</p>
              </div>
              <div>
                <p class="text-xs text-muted-foreground">{{ t('home.resident.floorLabel') }}</p>
                <p class="font-medium">
                  {{ contract.currentRoom.floor != null ? t('home.resident.floorValue', { floor: contract.currentRoom.floor }) : '-' }}
                </p>
              </div>
            </div>
            <div class="flex min-w-0 flex-1 flex-col gap-3 pl-4 max-[359px]:border-t max-[359px]:pl-0 max-[359px]:pt-3">
              <div>
                <p class="text-xs text-muted-foreground">{{ t('home.resident.contractNumberLabel') }}</p>
                <p class="break-all font-medium">{{ contract.number }}</p>
              </div>
              <div>
                <p class="text-xs text-muted-foreground">{{ t('home.resident.contractDateLabel') }}</p>
                <p class="font-medium">{{ formatDate(contract.contractDate) }}</p>
              </div>
            </div>
          </div>
          <div class="mt-auto border-t pt-3">
            <RouterLink to="/student/contract" class="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              {{ t('home.resident.contractLink') }}
              <ArrowRight class="size-3.5" />
            </RouterLink>
          </div>
        </template>
        <template v-else>
          <p class="text-sm text-muted-foreground">{{ t('home.resident.noContract') }}</p>
          <p class="text-xs text-muted-foreground">{{ t('home.resident.noContractHint') }}</p>
        </template>
      </Card>

      <Card class="flex min-w-0 flex-col gap-3 rounded-2xl border-0 p-3 sm:p-4">
        <div class="flex items-start gap-3">
          <div class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-green-100 dark:bg-green-500/20">
            <Wallet class="size-4 text-green-600 dark:text-green-400" />
          </div>
          <div class="min-w-0">
            <h2 class="text-sm font-semibold leading-5">{{ t('home.resident.paymentHeading') }}</h2>
            <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">{{ t('home.resident.paymentTagline') }}</p>
          </div>
        </div>
        <div v-if="contractState === 'loading'" class="space-y-3" aria-hidden="true"><div v-for="n in 3" :key="n" class="h-8 animate-pulse rounded bg-muted motion-reduce:animate-none" /></div>
        <p v-else-if="contractState === 'error'" class="text-sm text-destructive">{{ t('home.dataUnavailable') }}</p>
        <template v-else-if="contract">
          <div
            class="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2"
            :class="overdueBalance > 0 ? 'bg-red-50 dark:bg-red-500/10' : 'bg-green-50 dark:bg-green-500/10'"
          >
            <div>
              <p class="text-xs text-muted-foreground">{{ t('home.resident.debtLabel') }}</p>
              <p class="text-xl font-semibold" :class="overdueBalance > 0 ? 'text-red-500' : 'text-green-600'">
                {{ formatMoney(overdueBalance) }}
              </p>
            </div>
            <span
              v-if="overdueBalance > 0"
              class="shrink-0 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400"
            >
              {{ t('home.resident.overdue') }}
            </span>
          </div>
          <div>
            <p class="text-xs text-muted-foreground">{{ t('home.resident.nextPaymentHeading') }}</p>
            <div v-if="nextAccrual" class="mt-1 flex flex-wrap items-center justify-between gap-1.5 text-sm">
              <span>
                {{ t('home.resident.nextPaymentDue', { date: formatDate(nextAccrual.dueDate) }) }}
              </span>
              <span class="font-medium">{{ formatMoney(nextAccrual.balance) }}</span>
            </div>
            <p v-else class="mt-1 text-sm text-muted-foreground">{{ t('home.resident.noOpenAccruals') }}</p>
          </div>
          <div class="mt-auto border-t pt-3">
            <button
              type="button"
              class="inline-flex items-center gap-1 text-left text-sm text-primary hover:underline"
              @click="paymentDialog?.open()"
            >
              {{ t('home.resident.payAction') }}
              <ArrowRight class="size-3.5" />
            </button>
          </div>
        </template>
        <p v-else class="text-sm text-muted-foreground">{{ t('home.resident.noContract') }}</p>
      </Card>
    </div>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]">
      <Card class="flex min-w-0 flex-col gap-3 rounded-2xl border-0 p-3 sm:p-4">
        <div class="flex items-start gap-3">
          <div class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-500/20">
            <Megaphone class="size-4 text-violet-600 dark:text-violet-400" />
          </div>
          <div class="min-w-0">
            <h2 class="text-sm font-semibold leading-5">{{ t('home.resident.announcementsHeading') }}</h2>
            <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">{{ t('home.resident.announcementsTagline') }}</p>
          </div>
        </div>
        <div v-if="announcementsState === 'loading'" class="space-y-3" aria-hidden="true"><div v-for="n in 2" :key="n" class="h-16 animate-pulse rounded bg-muted motion-reduce:animate-none" /></div>
        <p v-else-if="announcementsState === 'error'" class="text-sm text-destructive">{{ t('home.dataUnavailable') }}</p>
        <p v-else-if="!announcements.length" class="text-sm text-muted-foreground">{{ t('home.resident.announcementsEmpty') }}</p>
        <div v-else class="flex flex-col gap-2">
          <button
            v-for="a in announcementsPreview"
            :key="a.id"
            type="button"
            class="flex min-w-0 flex-wrap items-center gap-3 rounded-lg bg-muted/50 p-3 text-left transition-colors hover:bg-blue-50 dark:bg-muted/20 dark:hover:bg-blue-500/10"
            @click="announcementReadDialog?.open(a)"
          >
            <div class="flex size-8 shrink-0 items-center justify-center rounded-lg" :class="iconBadgeColorClasses(a.id).container">
              <Newspaper class="size-4" :class="iconBadgeColorClasses(a.id).icon" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold">{{ a.title }}</p>
              <p class="truncate text-sm text-muted-foreground">{{ a.body }}</p>
            </div>
            <div class="ml-auto flex shrink-0 items-center gap-1.5">
              <span class="text-xs text-muted-foreground">{{ formatDate(a.createdAt) }}</span>
              <span class="size-2 shrink-0 rounded-full" :class="a.unread ? 'bg-blue-500' : 'bg-muted-foreground/40'" />
            </div>
          </button>
        </div>
        <div v-if="announcementsState === 'success'" class="mt-auto border-t pt-3">
          <button
            type="button"
            class="inline-flex items-center gap-1 text-left text-sm text-primary hover:underline"
            @click="allAnnouncementsDialog?.open()"
          >
            {{ t('home.resident.announcementsSeeAll') }}
            <ArrowRight class="size-3.5" />
          </button>
        </div>
      </Card>

      <ResidentNotificationsCard :demo="props.demo" />
    </div>

    <AnnouncementReadDialog ref="announcementReadDialog" @read="markAnnouncementAsRead" />
    <AllAnnouncementsDialog ref="allAnnouncementsDialog" :announcements="announcements" @read="markAnnouncementAsRead" />
  </div>
</template>

<style scoped>
.font-emoji {
  font-family:
    'Apple Color Emoji',
    'Segoe UI Emoji',
    'Segoe UI Symbol',
    'Noto Color Emoji',
    sans-serif;
}
</style>
