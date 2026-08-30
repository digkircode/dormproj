<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
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
const { t } = useI18n()

const ACTION_LABELS = computed<Record<string, string>>(() => ({
  CREATE: t('audit.actionCreate'),
  UPDATE: t('audit.actionUpdate'),
  DELETE: t('audit.actionDelete'),
}))
const ENTITY_TYPE_LABELS = computed<Record<string, string>>(() => ({
  Individual: t('audit.entityIndividual'),
  Contract: t('audit.entityContract'),
  Payment: t('audit.entityPayment'),
  Room: t('audit.entityRoom'),
  RoomCharacteristicDefinition: t('audit.entityRoomCharacteristicDefinition'),
  RoomCharacteristicValue: t('audit.entityRoomCharacteristicValue'),
  DormitoryInfo: t('audit.entityDormitoryInfo'),
  Role: t('audit.entityRole'),
  UserRole: t('audit.entityUserRole'),
  Announcement: t('audit.entityAnnouncement'),
}))

const columnLabels = computed<Record<string, string>>(() => ({
  createdAt: t('audit.colCreatedAt'),
  userFullName: t('audit.colUser'),
  action: t('audit.colAction'),
  entityType: t('audit.colEntityType'),
  entityLabel: t('audit.colEntityLabel'),
  changes: t('audit.colChanges'),
}))
const filterableFields = ['action', 'entityType']
const cellRenderers = { changes: AuditChangesCell }

function cellText(columnId: string, value: unknown): string {
  if (columnId === 'createdAt' && typeof value === 'string') return formatDateTime(value)
  if (columnId === 'action' && typeof value === 'string') return ACTION_LABELS.value[value] ?? value
  if (columnId === 'entityType' && typeof value === 'string') return ENTITY_TYPE_LABELS.value[value] ?? value
  return String(value ?? '')
}

const columnHelper = createAppColumnHelper<AuditLogRow>()
const columns = computed(() =>
  columnHelper.columns([
    columnHelper.accessor('createdAt', { header: columnLabels.value.createdAt, enableHiding: false, size: 176, minSize: 140 }),
    columnHelper.accessor('userFullName', { header: columnLabels.value.userFullName, size: 200, minSize: 140 }),
    columnHelper.accessor('action', { header: columnLabels.value.action, size: 128, minSize: 100 }),
    columnHelper.accessor('entityType', { header: columnLabels.value.entityType, size: 200, minSize: 140 }),
    columnHelper.accessor('entityLabel', { header: columnLabels.value.entityLabel, size: 240, minSize: 160 }),
    columnHelper.accessor('changes', { header: columnLabels.value.changes, enableSorting: false, size: 140, minSize: 120 }),
  ]),
)
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/')">
        <ArrowLeft class="text-primary" />
        <span class="sr-only">{{ t('audit.back') }}</span>
      </Button>
      <h1 class="text-lg font-medium">{{ t('audit.title') }}</h1>
    </div>

    <EntityTable
      :columns="columns"
      :column-labels="columnLabels"
      :filterable-fields="filterableFields"
      :default-sort="{ id: 'createdAt', desc: true }"
      :fetch-page="fetchAuditLogPage"
      :fetch-facet-values="fetchAuditLogFacets"
      :get-row-id="(r: AuditLogRow) => String(r.id)"
      :total-label="t('audit.totalLabel')"
      :cell-text="cellText"
      :cell-renderers="cellRenderers"
      storage-key="audit-log"
      accent-icons
    />
  </div>
</template>
