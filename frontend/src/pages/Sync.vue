<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  ArrowDownToLine, ArrowLeft, ArrowUpRight, BookUser, Building2, CalendarClock,
  CirclePercent, ClipboardCheck, ContactRound, FileOutput, Files, GraduationCap,
  IdCard, LoaderCircle, Play, ReceiptText, RotateCcw, UsersRound,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/api-base'
import { triggerSync } from '@/lib/sync-api'
import { formatDateTime, formatDuration } from '@/lib/sync-format'
import { goBack } from '@/lib/utils'

type JobState = 'RUNNING' | 'SUCCESS' | 'FAILED' | 'MISSED' | 'NOT_CONFIGURED' | 'NONE' | 'BLOCKED'
type JobGroup = 'UNIVERSITY' | 'PORTAL' | 'ACCOUNTING' | 'HOSTEL'
interface JobLog {
  status: 'RUNNING' | 'SUCCESS' | 'FAILED'
  startedAt: string
  finishedAt: string | null
  fetchedCount: number | null
  added: number | null
  updated: number | null
  removed: number | null
  errorMessage: string | null
  details: Record<string, unknown> | null
}
interface OverviewJob {
  id: string
  group: JobGroup
  state: JobState
  configured: boolean
  schedule: { kind: 'DAILY' | 'CHAIN'; hour: number; minute: number } | { kind: 'MANUAL' | 'STARTUP' }
  nextScheduledAt: string | null
  lastRun: JobLog | null
  lastSuccessAt: string | null
  manualPath: string | null
}

const router = useRouter()
const { t } = useI18n()
const jobs = ref<OverviewJob[]>([])
const loading = ref(true)
const loadError = ref(false)
const runningIds = ref<string[]>([])
const runErrors = ref<Record<string, string>>({})
const describedJobs = new Set(['portal-users'])
const jobIcons: Record<string, Component> = {
  students: GraduationCap,
  individuals: UsersRound,
  citizenship: IdCard,
  passport: ContactRound,
  'contact-info': BookUser,
  'portal-users': UsersRound,
  individual: ContactRound,
  'accounting-payment-push': FileOutput,
  'accounting-payment-import': ArrowDownToLine,
  'service-provision-preparation': Files,
  'service-provision-send': ArrowUpRight,
  'service-provision-recovery': RotateCcw,
  'contract-status': ClipboardCheck,
  penalties: CirclePercent,
}
let timer: ReturnType<typeof setTimeout> | undefined
let disposed = false

const groups = computed(() => ([
  { id: 'UNIVERSITY' as const, title: t('sync.overview.groups.UNIVERSITY'), icon: GraduationCap, jobs: jobs.value.filter((job) => job.group === 'UNIVERSITY') },
  { id: 'PORTAL' as const, title: t('sync.overview.groups.PORTAL'), icon: UsersRound, jobs: jobs.value.filter((job) => job.group === 'PORTAL') },
  { id: 'ACCOUNTING' as const, title: t('sync.overview.groups.ACCOUNTING'), icon: ReceiptText, jobs: jobs.value.filter((job) => job.group === 'ACCOUNTING') },
  { id: 'HOSTEL' as const, title: t('sync.overview.groups.HOSTEL'), icon: Building2, jobs: jobs.value.filter((job) => job.group === 'HOSTEL') },
]))

function scheduleText(job: OverviewJob): string {
  if (job.id === 'service-provision-preparation') return t('sync.overview.preparationSchedule')
  if (job.id === 'service-provision-send') return t('sync.overview.sendSchedule')
  const schedule = job.schedule
  if (!('hour' in schedule)) return t(schedule.kind === 'STARTUP' ? 'sync.overview.atStartup' : 'sync.overview.manual')
  if (schedule.kind === 'CHAIN') return t('sync.overview.afterPrevious')
  const time = `${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')}`
  return t('sync.overview.dailyAt', { time })
}
function nextText(job: OverviewJob): string {
  if (!job.nextScheduledAt) return '—'
  return job.schedule.kind === 'CHAIN'
    ? t('sync.overview.afterStart', { date: formatMoscowDateTime(job.nextScheduledAt) })
    : formatMoscowDateTime(job.nextScheduledAt)
}
function formatMoscowDateTime(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(iso))
}
function number(details: Record<string, unknown> | null, key: string): number | null {
  return typeof details?.[key] === 'number' ? details[key] as number : null
}
function isRunning(job: OverviewJob): boolean { return job.state === 'RUNNING' || runningIds.value.includes(job.id) }
function displayState(job: OverviewJob): JobState {
  if (runningIds.value.includes(job.id)) return 'RUNNING'
  const details = job.lastRun?.details ?? null
  if (job.state === 'FAILED' && (job.id === 'service-provision-send' || job.id === 'service-provision-recovery')
    && (number(details, 'blocked') ?? 0) > 0 && (number(details, 'failed') ?? 0) === 0
    && (number(details, 'pushed') ?? 0) === 0) return 'BLOCKED'
  return job.state
}
function resultText(job: OverviewJob): string {
  const log = job.lastRun
  if (!log) return t('sync.overview.noResult')
  const d = log.details
  if (log.status === 'FAILED' && !d) return t('sync.overview.resultUnavailable')
  if (job.id === 'accounting-payment-push') return t('sync.overview.results.push', { sent: number(d, 'sent') ?? 0, succeeded: number(d, 'succeeded') ?? 0, failed: number(d, 'failed') ?? 0 })
  if (job.id === 'accounting-payment-import') return t('sync.overview.results.import', { fetched: number(d, 'fetched') ?? 0, imported: number(d, 'imported') ?? 0, pairs: number(d, 'knownPairs') ?? 0 })
  if (job.id === 'service-provision-preparation') return t('sync.overview.results.documentsPrepared', { count: Array.isArray(d?.documentIds) ? d.documentIds.length : number(d, 'documentCount') ?? '—' })
  if (job.id === 'service-provision-send') return d?.skipped === true
    ? t('sync.overview.results.nothingToSend')
    : t('sync.overview.results.documentsSent', { pushed: number(d, 'pushed') ?? 0, succeeded: number(d, 'succeeded') ?? 0, failed: number(d, 'failed') ?? 0, blocked: number(d, 'blocked') ?? 0 })
  if (job.id === 'service-provision-recovery') return t('sync.overview.results.recovery', { pushed: number(d, 'pushed') ?? 0, succeeded: number(d, 'succeeded') ?? 0, failed: number(d, 'failed') ?? 0, blocked: number(d, 'blocked') ?? 0 })
  if (job.id === 'contract-status') return t('sync.overview.results.contracts', { processed: number(d, 'processedContracts') ?? 0, changed: (number(d, 'toExpiring') ?? 0) + (number(d, 'toCompleted') ?? 0) + (number(d, 'toOverdue') ?? 0) })
  if (job.id === 'penalties') return t('sync.overview.results.penalties', { processed: number(d, 'processedContracts') ?? 0, rows: number(d, 'penaltyRowsCreated') ?? 0 })
  if (job.id === 'portal-users') return t('sync.overview.results.portalUsers', { fetched: log.fetchedCount ?? 0, added: log.added ?? 0, updated: log.updated ?? 0, skipped: number(d, 'skipped') ?? 0 })
  return t('sync.overview.results.university', { fetched: log.fetchedCount ?? 0, added: log.added ?? 0, updated: log.updated ?? 0, removed: log.removed ?? 0 })
}

async function refresh() {
  try {
    const response = await apiFetch('/sync/overview')
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json() as OverviewJob[]
    if (disposed) return
    jobs.value = data
    loadError.value = false
  } catch (error) {
    console.error('Не удалось загрузить обзор синхронизации', error)
    if (!disposed) loadError.value = true
  } finally {
    if (!disposed) {
      loading.value = false
      clearTimeout(timer)
      timer = setTimeout(refresh, runningIds.value.length || jobs.value.some((job) => job.state === 'RUNNING') ? 3000 : 30000)
    }
  }
}

async function run(job: OverviewJob) {
  if (!job.manualPath || !job.configured || runningIds.value.includes(job.id)) return
  runningIds.value = [...runningIds.value, job.id]
  const nextErrors = { ...runErrors.value }
  delete nextErrors[job.id]
  runErrors.value = nextErrors
  try {
    clearTimeout(timer)
    timer = setTimeout(refresh, 1000)
    const result = await triggerSync(job.manualPath)
    if (!result.ok && !result.conflict) runErrors.value = { ...runErrors.value, [job.id]: result.message }
  } catch (error) {
    runErrors.value = { ...runErrors.value, [job.id]: error instanceof Error ? error.message : String(error) }
  } finally {
    runningIds.value = runningIds.value.filter((id) => id !== job.id)
    await refresh()
  }
}

onMounted(refresh)
onUnmounted(() => { disposed = true; clearTimeout(timer) })
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 md:p-6">
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/')">
          <ArrowLeft class="text-primary" /><span class="sr-only">{{ t('sync.back') }}</span>
        </Button>
        <h1 class="text-lg font-medium">{{ t('sync.title') }}</h1>
      </div>
    </div>
    <p v-if="loadError" class="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{{ t('sync.overview.loadError') }}</p>
    <div class="min-h-0 flex-1 overflow-y-auto pb-1">
      <div v-if="loading && !jobs.length" class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div v-for="index in 6" :key="index" class="h-52 animate-pulse rounded-xl border bg-muted/40" />
      </div>
      <section v-for="group in groups" v-else :key="group.id" class="mb-5 space-y-3 last:mb-0">
      <div class="flex items-center gap-2 border-b pb-2">
        <component :is="group.icon" class="size-4 shrink-0 text-primary" />
        <h2 class="text-base font-semibold">{{ group.title }}</h2>
        <span class="text-xs text-muted-foreground">{{ group.jobs.length }}</span>
      </div>
      <p v-if="group.id === 'UNIVERSITY'" class="text-xs text-muted-foreground">{{ t('sync.overview.universityFlow') }}</p>
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <article v-for="job in group.jobs" :key="job.id" class="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm">
          <div class="flex min-w-0 items-start justify-between gap-2">
            <div class="flex min-w-0 items-start gap-2.5">
              <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <component :is="jobIcons[job.id] ?? CalendarClock" class="size-4 text-primary" />
              </span>
              <div class="min-w-0">
                <h3 class="font-medium leading-5">{{ t(`sync.overview.jobs.${job.id}`) }}</h3>
                <p class="mt-1 text-xs text-muted-foreground">{{ scheduleText(job) }}</p>
                <p v-if="describedJobs.has(job.id)" class="mt-1 text-xs leading-4 text-muted-foreground">{{ t(`sync.overview.descriptions.${job.id}`) }}</p>
              </div>
            </div>
            <span class="shrink-0 rounded-full px-2 py-1 text-[11px] font-medium" :class="{
              'bg-emerald-100 text-emerald-800': displayState(job) === 'SUCCESS',
              'bg-red-100 text-red-800': displayState(job) === 'FAILED' || displayState(job) === 'MISSED',
              'bg-amber-100 text-amber-800': displayState(job) === 'NOT_CONFIGURED' || displayState(job) === 'BLOCKED',
              'bg-blue-100 text-blue-800': displayState(job) === 'RUNNING',
              'bg-muted text-muted-foreground': displayState(job) === 'NONE',
            }">{{ t(`sync.overview.states.${displayState(job)}`) }}</span>
          </div>
          <dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <div><dt class="text-muted-foreground">{{ t('sync.overview.lastRun') }}</dt><dd class="mt-0.5 font-medium">{{ job.lastRun ? formatDateTime(job.lastRun.startedAt) : '—' }}</dd></div>
            <div><dt class="text-muted-foreground">{{ t('sync.overview.lastSuccess') }}</dt><dd class="mt-0.5 font-medium">{{ job.lastSuccessAt ? formatDateTime(job.lastSuccessAt) : '—' }}</dd></div>
            <div><dt class="text-muted-foreground">{{ t('sync.overview.nextRun') }}</dt><dd class="mt-0.5 font-medium">{{ nextText(job) }}</dd></div>
            <div><dt class="text-muted-foreground">{{ t('sync.colDuration') }}</dt><dd class="mt-0.5 font-medium">{{ job.lastRun ? formatDuration(job.lastRun.startedAt, job.lastRun.finishedAt) : '—' }}</dd></div>
          </dl>
          <div class="min-h-9 text-xs leading-5">
            <span class="text-muted-foreground">{{ t('sync.overview.lastResult') }}: </span>{{ resultText(job) }}
            <p v-if="job.lastRun?.errorMessage" class="mt-1 line-clamp-2 text-red-600" :title="job.lastRun.errorMessage">{{ job.lastRun.errorMessage }}</p>
            <p v-if="runErrors[job.id]" class="mt-1 text-red-600">{{ runErrors[job.id] }}</p>
          </div>
          <div class="mt-auto flex items-center justify-between border-t pt-3">
            <Button variant="ghost" size="sm" @click="router.push(`/sync/${job.id}/logs`)">{{ t('sync.actionsLogs') }}<ArrowUpRight class="ml-1 size-3.5" /></Button>
            <Button v-if="job.manualPath" variant="outline" size="sm" :disabled="isRunning(job) || !job.configured" @click="run(job)">
              <LoaderCircle v-if="isRunning(job)" class="mr-1 size-3.5 animate-spin text-primary" />
              <Play v-else class="mr-1 size-3.5 text-primary" />
              {{ isRunning(job) ? t('sync.overview.running') : t('sync.overview.run') }}
            </Button>
          </div>
        </article>
      </div>
      </section>
    </div>
  </div>
</template>
