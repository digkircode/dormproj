<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronRight, CirclePlus, Pencil, Trash2 } from 'lucide-vue-next'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { fetchIndividualAuditLog, type IndividualAuditLogEntry } from '@/lib/individuals-api'

const { t } = useI18n()

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'

const ACTION_LABELS = computed<Record<string, string>>(() => ({
  CREATE: t('individuals.history.actionCreate'),
  UPDATE: t('individuals.history.actionUpdate'),
  DELETE: t('individuals.history.actionDelete'),
}))
const ACTION_ICONS: Record<string, unknown> = { CREATE: CirclePlus, UPDATE: Pencil, DELETE: Trash2 }
const ACTION_ICON_CLASS: Record<string, string> = {
  CREATE: 'text-emerald-600 dark:text-emerald-400',
  UPDATE: 'text-primary',
  DELETE: 'text-red-500',
}

// Те же имена полей, что в AUDITED_INDIVIDUAL_FIELDS/AUDITED_INDIVIDUAL_UPDATE_FIELDS на
// бэкенде (individuals.controller.ts) — иначе они показывались бы как есть по-английски
// (см. известное упрощение в /audit-log, здесь решили сразу сделать по-русски).
const FIELD_LABELS = computed<Record<string, string>>(() => ({
  fullName: t('individuals.history.fieldFullName'),
  surname: t('individuals.history.fieldSurname'),
  name: t('individuals.history.fieldName'),
  otchestvo: t('individuals.history.fieldOtchestvo'),
  birthDate: t('individuals.history.fieldBirthDate'),
  gender: t('individuals.history.fieldGender'),
  citizenship: t('individuals.history.fieldCitizenship'),
  birthPlace: t('individuals.history.fieldBirthPlace'),
  registrationAddress: t('individuals.history.fieldRegistrationAddress'),
  residenceAddress: t('individuals.history.fieldResidenceAddress'),
  address: t('individuals.history.fieldAddress'),
  phone: t('individuals.history.fieldPhone'),
  email: t('individuals.history.fieldEmail'),
  snils: t('individuals.history.fieldSnils'),
  inn: t('individuals.history.fieldInn'),
  passportSeries: t('individuals.history.fieldPassportSeries'),
  passportNumber: t('individuals.history.fieldPassportNumber'),
  passportIssuedBy: t('individuals.history.fieldPassportIssuedBy'),
  passportIssuedCode: t('individuals.history.fieldPassportIssuedCode'),
  passportIssuedAt: t('individuals.history.fieldPassportIssuedAt'),
}))

const isOpen = ref(false)
const isLoading = ref(false)
const loadError = ref('')
const entries = ref<IndividualAuditLogEntry[]>([])
// Таблица изменений по умолчанию свёрнута (по прямой просьбе) — раскрывается по клику
// на саму запись, id записи в наборе = раскрыта. Сбрасывается при каждом открытии диалога.
const expandedIds = ref<Set<number>>(new Set())

async function open(uid: string) {
  isOpen.value = true
  isLoading.value = true
  loadError.value = ''
  entries.value = []
  expandedIds.value = new Set()
  try {
    entries.value = await fetchIndividualAuditLog(uid)
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isLoading.value = false
  }
}

defineExpose({ open })

function toggleExpanded(id: number) {
  const next = new Set(expandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedIds.value = next
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? t('boolean.yes') : t('boolean.no')
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(T|$)/.test(value)) {
    const date = new Date(value)
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
  }
  return String(value)
}
</script>

<template>
  <Dialog :open="isOpen" @update:open="(v) => (isOpen = v)">
    <DialogScrollContent :class="['flex flex-col gap-4 sm:max-w-2xl', DIALOG_ANIMATE_CLASS]">
      <DialogHeader>
        <DialogTitle>{{ t('individuals.history.title') }}</DialogTitle>
      </DialogHeader>

      <p v-if="loadError" class="text-sm text-red-500">{{ loadError }}</p>
      <p v-else-if="isLoading" class="text-sm text-muted-foreground">{{ t('individuals.history.loading') }}</p>
      <p v-else-if="entries.length === 0" class="text-sm text-muted-foreground">{{ t('individuals.history.noChanges') }}</p>

      <div v-for="entry in entries" :key="entry.id" class="flex flex-col gap-2 rounded-md border p-3">
        <button
          type="button"
          class="flex items-center justify-between gap-2 text-left text-sm"
          :disabled="!entry.changes || Object.keys(entry.changes).length === 0"
          @click="toggleExpanded(entry.id)"
        >
          <span class="flex items-center gap-1.5 font-medium">
            <ChevronRight
              v-if="entry.changes && Object.keys(entry.changes).length > 0"
              class="size-4 shrink-0 text-muted-foreground transition-transform"
              :class="{ 'rotate-90': expandedIds.has(entry.id) }"
            />
            <component :is="ACTION_ICONS[entry.action]" class="size-4 shrink-0" :class="ACTION_ICON_CLASS[entry.action]" />
            {{ ACTION_LABELS[entry.action] ?? entry.action }}
          </span>
          <span class="text-muted-foreground">{{ entry.userFullName }} · {{ formatDateTime(entry.createdAt) }}</span>
        </button>
        <div
          v-if="expandedIds.has(entry.id) && entry.changes && Object.keys(entry.changes).length > 0"
          class="overflow-hidden rounded-md border"
        >
          <Table>
            <TableHeader class="bg-muted">
              <TableRow>
                <TableHead>{{ t('individuals.history.colField') }}</TableHead>
                <TableHead>{{ t('individuals.history.colBefore') }}</TableHead>
                <TableHead>{{ t('individuals.history.colAfter') }}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="(change, field) in entry.changes" :key="field">
                <TableCell class="font-medium">{{ FIELD_LABELS[field] ?? field }}</TableCell>
                <TableCell class="text-muted-foreground">{{ formatValue(change.before) }}</TableCell>
                <TableCell>{{ formatValue(change.after) }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </DialogScrollContent>
  </Dialog>
</template>
