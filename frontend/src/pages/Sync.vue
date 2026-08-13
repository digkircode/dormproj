<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileText, CircleCheck, CircleX, Loader, Play } from 'lucide-vue-next'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { fetchStudentSyncLogs, triggerStudentSync, type SyncLogEntry } from '@/lib/sync-api'

const staticRows = [
  { name: 'Физические лица', status: '—', time: '—', duration: '—' },
  { name: 'Контактная информация', status: '—', time: '—', duration: '—' },
  { name: 'Паспортные данные', status: '—', time: '—', duration: '—' },
  { name: 'Гражданство', status: '—', time: '—', duration: '—' },
]

const statusLabel = {
  RUNNING: 'В процессе',
  SUCCESS: 'Успешно',
  FAILED: 'Ошибка',
} as const

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatDuration(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return '—'
  const seconds = Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000)
  const minutes = Math.floor(seconds / 60)
  return minutes > 0 ? `${minutes}м ${seconds % 60}с` : `${seconds}с`
}

const latestStudentSync = ref<SyncLogEntry | null>(null)
const isRunning = ref(false)
const errorText = ref('')

const studentSyncRow = computed(() => {
  const log = latestStudentSync.value
  return {
    name: 'Контингент студентов',
    status: isRunning.value ? 'В процессе' : log ? statusLabel[log.status] : '—',
    time: log ? formatDateTime(log.startedAt) : '—',
    duration: log ? formatDuration(log.startedAt, log.finishedAt) : '—',
    isReal: true,
  }
})

const rows = computed(() => [studentSyncRow.value, ...staticRows.map((r) => ({ ...r, isReal: false }))])

const statusIcon = {
  'Успешно': CircleCheck,
  'Ошибка': CircleX,
  'В процессе': Loader,
} as const

const statusIconClass: Record<string, string> = {
  'Успешно': 'fill-emerald-500 text-white',
  'Ошибка': 'fill-red-500 text-white',
  'В процессе': 'animate-spin text-muted-foreground',
}

async function loadLatestLog() {
  try {
    const logs = await fetchStudentSyncLogs()
    latestStudentSync.value = logs[0] ?? null
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : String(error)
  }
}

const POLL_INTERVAL_MS = 3000
const MAX_POLL_MS = 3 * 60 * 1000

// Если синхронизацию уже запустили с другого устройства, наш POST сразу вернёт 409 —
// но сам запуск где-то там всё ещё идёт. Раньше статус тут просто замирал на моменте
// конфликта; теперь опрашиваем логи, пока чужой запуск не завершится.
async function pollUntilIdle() {
  const deadline = Date.now() + MAX_POLL_MS
  while (Date.now() < deadline) {
    await loadLatestLog()
    if (latestStudentSync.value?.status !== 'RUNNING') return
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
}

async function runStudentSync() {
  if (isRunning.value) return
  isRunning.value = true
  errorText.value = ''
  const result = await triggerStudentSync()
  if (result.ok) {
    await loadLatestLog()
  } else if (result.conflict) {
    await pollUntilIdle()
  } else {
    errorText.value = result.message
    await loadLatestLog()
  }
  isRunning.value = false
}

onMounted(loadLatestLog)
</script>

<template>
  <div class="flex flex-1 flex-col gap-4 p-4 md:p-6">
    <p v-if="errorText" class="text-sm text-red-500">{{ errorText }}</p>
    <Card class="gap-0 py-0">
      <Table>
        <TableHeader class="bg-muted sticky top-0 z-10">
          <TableRow>
            <TableHead>Название</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead>Время</TableHead>
            <TableHead class="whitespace-nowrap">Длит.</TableHead>
            <TableHead class="w-10" />
            <TableHead class="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="(row, i) in rows" :key="i">
            <TableCell class="font-medium">{{ row.name }}</TableCell>
            <TableCell>
              <span class="flex items-center gap-2">
                <component :is="statusIcon[row.status as keyof typeof statusIcon]" class="size-4" :class="statusIconClass[row.status]" />
                {{ row.status }}
              </span>
            </TableCell>
            <TableCell class="text-muted-foreground">{{ row.time }}</TableCell>
            <TableCell class="whitespace-nowrap text-muted-foreground">{{ row.duration }}</TableCell>
            <TableCell>
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button variant="ghost" size="icon" class="size-7">
                    <FileText />
                    <span class="sr-only">Логи</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Просмотреть логи</TooltipContent>
              </Tooltip>
            </TableCell>
            <TableCell>
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="size-7"
                    :disabled="row.isReal && isRunning"
                    @click="row.isReal ? runStudentSync() : undefined"
                  >
                    <Loader v-if="row.isReal && isRunning" class="animate-spin" />
                    <Play v-else />
                    <span class="sr-only">Запустить</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Запустить синхронизацию</TooltipContent>
              </Tooltip>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Card>
  </div>
</template>
