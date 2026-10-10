<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Eye } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import type { AuditLogRow } from '@/lib/audit-log-api'
import { dateLocaleTag } from '@/lib/format-locale'

const props = defineProps<{ value: unknown; row: AuditLogRow }>()

const { t, te } = useI18n()

const isOpen = ref(false)
const FIELD_LABELS = computed<Record<string, string>>(() => ({
  accounting1cUid: t('audit.fieldAccounting1cUid'),
  accounting1cContractorUid: t('audit.fieldAccounting1cContractorUid'),
  _operation: t('audit.fieldOperation'),
  _penaltyRowsCount: t('audit.fieldPenaltyRowsCount'),
  _penaltyTotal: t('audit.fieldPenaltyTotal'),
  penaltyAccruedThrough: t('audit.fieldPenaltyAccruedThrough'),
  fullName: t('individuals.history.fieldFullName'),
  surname: t('individuals.history.fieldSurname'),
  name: t('audit.fieldName'),
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
  number: t('contracts.createDialog.fieldNumber'),
  contractDate: t('contracts.createDialog.fieldContractDate'),
  residentIndividualUid: t('audit.fieldResidentUid'),
  startDate: t('contracts.createDialog.fieldStartDate'),
  endDate: t('contracts.createDialog.fieldEndDate'),
  actualEndDate: t('contracts.detail.actualEndDate'),
  status: t('audit.fieldStatus'),
  residenceReason: t('contracts.createDialog.fieldResidenceReason'),
  legalRepName: t('contracts.createDialog.fieldFullName'),
  legalRepPhone: t('contracts.createDialog.fieldPhone'),
  legalRepGender: t('contracts.createDialog.fieldGender'),
  legalRepBirthDate: t('contracts.createDialog.fieldBirthDate'),
  legalRepPassportSeries: t('contracts.createDialog.fieldPassportSeries'),
  legalRepPassportNumber: t('contracts.createDialog.fieldPassportNumber'),
  legalRepPassportIssuedBy: t('contracts.createDialog.fieldPassportIssuedBy'),
  legalRepPassportIssuedCode: t('contracts.createDialog.fieldPassportIssuedCode'),
  legalRepPassportIssuedAt: t('contracts.createDialog.fieldPassportIssuedAt'),
  legalRepSnils: t('contracts.createDialog.fieldSnils'),
  legalRepInn: t('contracts.createDialog.fieldInn'),
  legalRepAddress: t('contracts.createDialog.fieldAddress'),
  matCapitalCoveredFrom: t('audit.fieldCapitalFrom'),
  matCapitalCoveredTo: t('audit.fieldCapitalTo'),
  matCapitalAmount: t('audit.fieldCapitalAmount'),
  matCapitalDeferredUntil: t('contracts.createDialog.fieldDeferredUntil'),
  room: t('audit.fieldRoom'),
  period: t('rooms.detail.colPeriod'),
  value: t('rooms.detail.colValue'),
  title: t('announcements.dialog.titleLabel'),
  body: t('announcements.dialog.bodyLabel'),
  amount: t('contracts.detail.amount'),
  paidAt: t('audit.fieldPaidAt'),
  method: t('contracts.detail.paymentMethod'),
  source: t('audit.fieldSource'),
  rawComment: t('contracts.detail.comment'),
  reversedAt: t('audit.fieldReversedAt'),
  roleName: t('audit.fieldRole'),
  valueType: t('rooms.definitions.colValueType'),
  unit: t('rooms.definitions.colUnit'),
  options: t('rooms.definitions.optionsLabel'),
  order: t('audit.fieldOrder'),
  azureId: t('audit.fieldAzureId'),
  univerId: t('audit.fieldUniverId'),
  linkSource: t('audit.fieldLinkSource'),
  communalServicesCost: t('rooms.detail.dormitoryFields.communalServicesCost'),
  dailyPaymentInternal: t('rooms.detail.dormitoryFields.dailyPaymentInternal'),
  dailyPaymentOther: t('rooms.detail.dormitoryFields.dailyPaymentOther'),
  passRestorationCost: t('rooms.detail.dormitoryFields.passRestorationCost'),
  guestRoomDailyRate: t('rooms.detail.dormitoryFields.guestRoomDailyRate'),
  documentSumm: t('audit.fieldDocumentSumm'),
  contractCount: t('audit.fieldContractCount'),
  accounting1cSyncStatus: t('audit.fieldAccounting1cSyncStatus'),
  accounting1cDocumentUid: t('audit.fieldAccounting1cDocumentUid'),
  accounting1cSyncError: t('audit.fieldAccounting1cSyncError'),
  mergedIntoUid: t('audit.fieldMergedIntoUid'),
}))

function fieldLabel(field: string): string {
  if (field === 'name' && props.row.entityType === 'Individual') return t('individuals.history.fieldName')
  return FIELD_LABELS.value[field] ?? field
}

function formatOperation(value: string): string {
  if (value === 'PENALTY_RECALC_NO_CHANGE') return t('audit.penaltyRecalculationNoChange')
  if (value === 'PENALTY_TERMINATION_RECALC_NO_CHANGE') return t('audit.penaltyTerminationRecalculationNoChange')
  // В старых записях нет признака полного совпадения дневного журнала. Когда
  // отсутствуют изменения суммы и числа строк, можно утверждать только это.
  if (value === 'Ручной пересчёт пени'
    && !('_penaltyRowsCount' in (props.row.changes ?? {}))
    && !('_penaltyTotal' in (props.row.changes ?? {}))) {
    return t('audit.penaltyTotalsUnchanged')
  }
  if (value === 'Пересчёт пени при расторжении'
    && !('_penaltyTotal' in (props.row.changes ?? {}))) {
    return t('audit.penaltyTerminationTotalUnchanged')
  }
  const separator = value.indexOf(': {')
  if (separator < 0) return value
  try {
    const details: unknown = JSON.parse(value.slice(separator + 2))
    if (!details || typeof details !== 'object' || Array.isArray(details)) return value
    const counters = details as Record<string, unknown>
    const operation = value.slice(0, separator)
    const isRecalculation = operation === 'Ручной пересчёт'
    const keys = isRecalculation
      ? ['requested', 'recalculated']
      : operation === 'Ручная отправка в 1С'
        ? ['pushed', 'succeeded', 'failed', 'blocked', 'skipped']
        : []
    if (!keys.length) return value
    const lines = keys
      .filter((key) => typeof counters[key] === 'number' || typeof counters[key] === 'boolean')
      .map((key) => `${t(`audit.operationResult.${key}`)}: ${typeof counters[key] === 'boolean' ? (counters[key] ? t('boolean.yes') : t('boolean.no')) : counters[key]}`)
    if (!lines.length) return value
    const title = isRecalculation ? t('audit.operationRecalculation') : t('audit.operationSend')
    return `${title}\n${lines.join('\n')}`
  } catch {
    return value
  }
}

function formatValue(value: unknown, field: string): string {
  if (value === null || value === undefined || value === '') return '-'
  if (field === 'order' && Array.isArray(value)) {
    return value.map((item, index) => `${index + 1}. ${String(item)}`).join('\n')
  }
  if (typeof value === 'boolean') return value ? t('boolean.yes') : t('boolean.no')
  if (typeof value === 'string') {
    const enumKey = field === 'status' ? `contracts.status.${value}`
      : field === 'method' ? `payment.method.${value}`
      : field === 'source' ? `audit.source.${value}`
      : field === 'accounting1cSyncStatus' ? `paymentImports.statusWebsite.${value}` : ''
    if (enumKey && te(enumKey)) return t(enumKey)
    if (field === '_operation') {
      return formatOperation(value)
    }
  }
  if (field === '_penaltyTotal' && typeof value === 'number') {
    return `${new Intl.NumberFormat(dateLocaleTag(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ₽`
  }
  // ISO-строка (дата/дата-время) — те же паттерны, что и во всём приложении.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(T|$)/.test(value)) {
    const date = new Date(value)
    return date.toLocaleDateString(dateLocaleTag())
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
              <TableCell class="font-medium">{{ fieldLabel(field) }}</TableCell>
              <TableCell class="whitespace-pre-wrap break-words text-muted-foreground">{{ formatValue(change.before, field) }}</TableCell>
              <TableCell class="whitespace-pre-wrap break-words">{{ formatValue(change.after, field) }}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </DialogScrollContent>
  </Dialog>
</template>
