export interface SyncEntity {
  slug: string
  // Ключ i18n, не готовый текст — резолвится через t() в месте использования (см.
  // SyncLogs.vue), чтобы название реагировало на смену языка (тот же приём, что
  // nameKey в useSyncRow.ts).
  nameKey: string
  basePath: string
  // Только у точечной синхронизации физлица — у неё Trigger всегда MANUAL (бессмысленно
  // показывать/фильтровать колонку "Тип"), вместо неё показываем UID синхронизированного
  // физлица (см. SyncLogs.vue).
  showTargetUid?: boolean
}

export const SYNC_ENTITIES: SyncEntity[] = [
  { slug: 'students', nameKey: 'nav.students', basePath: '/sync/students' },
  { slug: 'individuals', nameKey: 'nav.individuals', basePath: '/sync/individuals' },
  { slug: 'citizenship', nameKey: 'nav.citizenship', basePath: '/sync/citizenship' },
  { slug: 'passport', nameKey: 'nav.passportData', basePath: '/sync/passport' },
  { slug: 'contact-info', nameKey: 'nav.contactInfo', basePath: '/sync/contact-info' },
  { slug: 'portal-users', nameKey: 'sync.overview.jobs.portal-users', basePath: '/sync/portal-users' },
  { slug: 'individual', nameKey: 'sync.individualEntityName', basePath: '/sync/individual', showTargetUid: true },
  { slug: 'service-provision-documents', nameKey: 'sync.serviceProvisionDocumentsEntityName', basePath: '/sync/service-provision-documents' },
  { slug: 'penalties', nameKey: 'sync.penaltiesEntityName', basePath: '/sync/penalties' },
  { slug: 'contract-status', nameKey: 'sync.contractStatusEntityName', basePath: '/sync/contract-status' },
  { slug: 'accounting-payment-push', nameKey: 'sync.overview.jobs.accounting-payment-push', basePath: '/sync/overview/jobs/accounting-payment-push' },
  { slug: 'accounting-payment-import', nameKey: 'sync.overview.jobs.accounting-payment-import', basePath: '/sync/overview/jobs/accounting-payment-import' },
  { slug: 'service-provision-preparation', nameKey: 'sync.overview.jobs.service-provision-preparation', basePath: '/sync/overview/jobs/service-provision-preparation' },
  { slug: 'service-provision-send', nameKey: 'sync.overview.jobs.service-provision-send', basePath: '/sync/overview/jobs/service-provision-send' },
  { slug: 'service-provision-recovery', nameKey: 'sync.overview.jobs.service-provision-recovery', basePath: '/sync/overview/jobs/service-provision-recovery' },
]
