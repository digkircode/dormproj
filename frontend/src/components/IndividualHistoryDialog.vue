<script setup lang="ts">
import { ref } from 'vue'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { fetchIndividualAuditLog, type IndividualAuditLogEntry } from '@/lib/individuals-api'

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'

const ACTION_LABELS: Record<string, string> = { CREATE: 'Создание', UPDATE: 'Изменение', DELETE: 'Удаление' }

// Те же имена полей, что в AUDITED_INDIVIDUAL_FIELDS/AUDITED_INDIVIDUAL_UPDATE_FIELDS на
// бэкенде (individuals.controller.ts) — иначе они показывались бы как есть по-английски
// (см. известное упрощение в /audit-log, здесь решили сразу сделать по-русски).
const FIELD_LABELS: Record<string, string> = {
  fullName: 'ФИО',
  surname: 'Фамилия',
  name: 'Имя',
  otchestvo: 'Отчество',
  birthDate: 'Дата рождения',
  gender: 'Пол',
  citizenship: 'Гражданство',
  birthPlace: 'Место рождения',
  registrationAddress: 'Адрес по прописке',
  residenceAddress: 'Адрес места проживания',
  address: 'Адрес',
  phone: 'Телефон',
  email: 'Email',
  snils: 'СНИЛС',
  inn: 'ИНН',
  passportSeries: 'Паспорт: серия',
  passportNumber: 'Паспорт: номер',
  passportIssuedBy: 'Кем выдан',
  passportIssuedCode: 'Код подразделения',
  passportIssuedAt: 'Дата выдачи',
}

const isOpen = ref(false)
const isLoading = ref(false)
const loadError = ref('')
const entries = ref<IndividualAuditLogEntry[]>([])

async function open(uid: string) {
  isOpen.value = true
  isLoading.value = true
  loadError.value = ''
  entries.value = []
  try {
    entries.value = await fetchIndividualAuditLog(uid)
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isLoading.value = false
  }
}

defineExpose({ open })

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет'
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
        <DialogTitle>История изменений</DialogTitle>
      </DialogHeader>

      <p v-if="loadError" class="text-sm text-red-500">{{ loadError }}</p>
      <p v-else-if="isLoading" class="text-sm text-muted-foreground">Загрузка…</p>
      <p v-else-if="entries.length === 0" class="text-sm text-muted-foreground">Изменений пока не было</p>

      <div v-for="entry in entries" :key="entry.id" class="flex flex-col gap-2 rounded-md border p-3">
        <div class="flex items-center justify-between text-sm">
          <span class="font-medium">{{ ACTION_LABELS[entry.action] ?? entry.action }}</span>
          <span class="text-muted-foreground">{{ entry.userFullName }} · {{ formatDateTime(entry.createdAt) }}</span>
        </div>
        <div v-if="entry.changes && Object.keys(entry.changes).length > 0" class="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Поле</TableHead>
                <TableHead>Было</TableHead>
                <TableHead>Стало</TableHead>
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
