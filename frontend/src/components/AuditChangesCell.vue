<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Eye } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import type { AuditLogRow } from '@/lib/audit-log-api'

const props = defineProps<{ value: unknown; row: AuditLogRow }>()

const { t } = useI18n()

const isOpen = ref(false)
const FIELD_LABELS = computed<Record<string, string>>(() => ({
  accounting1cUid: t('audit.fieldAccounting1cUid'),
  accounting1cContractorUid: t('audit.fieldAccounting1cContractorUid'),
  _operation: t('audit.fieldOperation'),
}))

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? t('boolean.yes') : t('boolean.no')
  // ISO-строка (дата/дата-время) — те же паттерны, что и во всём приложении.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(T|$)/.test(value)) {
    const date = new Date(value)
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
  }
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}
</script>

<template>
  <Button variant="outline" size="sm" @click="isOpen = true">
    <Eye class="size-3.5 text-primary" />
    {{ Object.keys(row.changes ?? {}).length }}
    {{ Object.keys(row.changes ?? {}).length === 1 ? t('audit.fieldsCountOne') : t('audit.fieldsCountOther') }}
  </Button>

  <Dialog :open="isOpen" @update:open="(v) => (isOpen = v)">
    <DialogScrollContent class="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{{ row.entityLabel }}</DialogTitle>
      </DialogHeader>
      <div class="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{{ t('audit.colField') }}</TableHead>
              <TableHead>{{ t('audit.colBefore') }}</TableHead>
              <TableHead>{{ t('audit.colAfter') }}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="(change, field) in row.changes" :key="field">
              <TableCell class="font-medium">{{ FIELD_LABELS[field] ?? field }}</TableCell>
              <TableCell class="text-muted-foreground">{{ formatValue(change.before) }}</TableCell>
              <TableCell>{{ formatValue(change.after) }}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </DialogScrollContent>
  </Dialog>
</template>
