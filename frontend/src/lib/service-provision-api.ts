import { apiFetch } from './api-base'
import { i18n } from '@/i18n'
import type { Accounting1cSyncStatus } from './payment-imports-api'

export type ServiceProvisionType = 'RENT' | 'UTILITIES'

// Флоу 3 (см. промпт проекта) — только чтение + ручной повтор, своего одобрения/правки
// нет: суммы собираются автоматически из начислений, сотрудник ничего тут не вводит.
export interface ServiceProvisionDocumentRow {
  id: number
  periodStart: string
  type: ServiceProvisionType
  documentSumm: number
  contractCount: number
  accounting1cSyncStatus: Accounting1cSyncStatus
  accounting1cDocumentUid: string | null
  accounting1cSyncError: string | null
  accounting1cSyncedAt: string | null
}

export interface ServiceProvisionRunResult {
  pushed: number
  succeeded: number
  failed: number
  skipped: boolean
}

// Одна строка сводного документа — конкретный договор внутри него (см.
// billing.controller.ts#getServiceProvisionDocument). contractNumber/residentFullName —
// null, если договор с тех пор потерял привязку к 1С Бухгалтерии (отвязан/удалён) —
// сумма всё равно показывается, просто без опознания, кому она принадлежит.
export interface ServiceProvisionDocumentLine {
  contractId: number | null
  contractNumber: string | null
  residentFullName: string | null
  amount: number
}
export interface ServiceProvisionDocumentDetail extends ServiceProvisionDocumentRow {
  lines: ServiceProvisionDocumentLine[]
}

export async function fetchServiceProvisionDocuments(): Promise<ServiceProvisionDocumentRow[]> {
  const response = await apiFetch('/service-provision-documents')
  if (!response.ok) {
    throw new Error(i18n.global.t('serviceProvisionDocuments.errors.fetchListFailed', { status: response.status }))
  }
  return response.json()
}

export async function fetchServiceProvisionDocumentDetail(id: number): Promise<ServiceProvisionDocumentDetail> {
  const response = await apiFetch(`/service-provision-documents/${id}`)
  if (!response.ok) {
    throw new Error(i18n.global.t('serviceProvisionDocuments.errors.fetchDetailFailed', { status: response.status }))
  }
  return response.json()
}

// Пересобирает документы "Найм"/"Коммуналка" за уже закончившийся месяц (тот же месяц,
// что и у ночного крона, см. service-provision-doc.service.ts#run) — идемпотентно,
// повторный вызов обновит уже созданные документы, а не расплодит дубли.
export async function runServiceProvisionDocuments(): Promise<ServiceProvisionRunResult> {
  const response = await apiFetch('/service-provision-documents/run', { method: 'POST' })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? i18n.global.t('serviceProvisionDocuments.errors.runFailed', { status: response.status }))
  }
  return response.json()
}
