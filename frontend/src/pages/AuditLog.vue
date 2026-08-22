<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import EntityTable from '@/components/EntityTable.vue'
import AuditChangesCell from '@/components/AuditChangesCell.vue'
import { createAppColumnHelper } from '@/lib/table'
import { fetchAuditLogPage, fetchAuditLogFacets, type AuditLogRow } from '@/lib/audit-log-api'
import { formatDateTime } from '@/lib/sync-format'
import { goBack } from '@/lib/utils'

const router = useRouter()

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Создание',
  UPDATE: 'Изменение',
  DELETE: 'Удаление',
}
const ENTITY_TYPE_LABELS: Record<string, string> = {
  Individual: 'Физическое лицо',
  Contract: 'Договор',
  Payment: 'Платёж',
  Room: 'Комната',
  RoomCharacteristicDefinition: 'Характеристика комнаты',
  RoomCharacteristicValue: 'Значение характеристики',
  DormitoryInfo: 'Настройки общежития',
  Role: 'Роль',
  UserRole: 'Роль пользователя',
}

const columnLabels: Record<string, string> = {
  createdAt: 'Дата и время',
  userFullName: 'Пользователь',
  action: 'Действие',
  entityType: 'Сущность',
  entityLabel: 'Что изменено',
  changes: 'Изменения',
}
const filterableFields = ['action', 'entityType']
const cellRenderers = { changes: AuditChangesCell }

function cellText(columnId: string, value: unknown): string {
  if (columnId === 'createdAt' && typeof value === 'string') return formatDateTime(value)
  if (columnId === 'action' && typeof value === 'string') return ACTION_LABELS[value] ?? value
  if (columnId === 'entityType' && typeof value === 'string') return ENTITY_TYPE_LABELS[value] ?? value
  return String(value ?? '')
}

const columnHelper = createAppColumnHelper<AuditLogRow>()
const columns = columnHelper.columns([
  columnHelper.accessor('createdAt', { header: columnLabels.createdAt, enableHiding: false, size: 176, minSize: 140 }),
  columnHelper.accessor('userFullName', { header: columnLabels.userFullName, size: 200, minSize: 140 }),
  columnHelper.accessor('action', { header: columnLabels.action, size: 128, minSize: 100 }),
  columnHelper.accessor('entityType', { header: columnLabels.entityType, size: 200, minSize: 140 }),
  columnHelper.accessor('entityLabel', { header: columnLabels.entityLabel, size: 240, minSize: 160 }),
  columnHelper.accessor('changes', { header: columnLabels.changes, enableSorting: false, size: 140, minSize: 120 }),
])
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/')">
        <ArrowLeft class="text-primary" />
        <span class="sr-only">Назад</span>
      </Button>
      <h1 class="text-lg font-medium">История изменений</h1>
    </div>

    <EntityTable
      :columns="columns"
      :column-labels="columnLabels"
      :filterable-fields="filterableFields"
      :default-sort="{ id: 'createdAt', desc: true }"
      :fetch-page="fetchAuditLogPage"
      :fetch-facet-values="fetchAuditLogFacets"
      :get-row-id="(r: AuditLogRow) => String(r.id)"
      total-label="записей"
      :cell-text="cellText"
      :cell-renderers="cellRenderers"
      storage-key="audit-log"
      accent-icons
    />
  </div>
</template>
