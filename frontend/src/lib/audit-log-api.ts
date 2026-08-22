import { fetchListPage, fetchListFacets, type ListOptions, type ListPage, type FacetOption } from './list-api'

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE'

export interface AuditLogChange {
  before: unknown
  after: unknown
}

export interface AuditLogRow {
  id: number
  userFullName: string
  action: AuditAction
  entityType: string
  entityId: string
  entityLabel: string
  changes: Record<string, AuditLogChange>
  createdAt: string
}

export type AuditLogPage = ListPage<AuditLogRow>
export type FetchAuditLogOptions = ListOptions
export type { FacetOption }

export function fetchAuditLogPage(options: FetchAuditLogOptions): Promise<AuditLogPage> {
  return fetchListPage<AuditLogRow>('/audit-log', options)
}

export function fetchAuditLogFacets(field: string): Promise<FacetOption[]> {
  return fetchListFacets('/audit-log', field)
}
