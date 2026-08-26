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
  { slug: 'individual', nameKey: 'sync.individualEntityName', basePath: '/sync/individual', showTargetUid: true },
]
