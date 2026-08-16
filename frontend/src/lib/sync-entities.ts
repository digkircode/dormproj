export interface SyncEntity {
  slug: string
  name: string
  basePath: string
  // Только у точечной синхронизации физлица — у неё Trigger всегда MANUAL (бессмысленно
  // показывать/фильтровать колонку "Тип"), вместо неё показываем UID синхронизированного
  // физлица (см. SyncLogs.vue).
  showTargetUid?: boolean
}

export const SYNC_ENTITIES: SyncEntity[] = [
  { slug: 'students', name: 'Контингент студентов', basePath: '/sync/students' },
  { slug: 'individuals', name: 'Физические лица', basePath: '/sync/individuals' },
  { slug: 'citizenship', name: 'Гражданство', basePath: '/sync/citizenship' },
  { slug: 'passport', name: 'Паспортные данные', basePath: '/sync/passport' },
  { slug: 'contact-info', name: 'Контактная информация', basePath: '/sync/contact-info' },
  { slug: 'individual', name: 'Обновление данных физического лица', basePath: '/sync/individual', showTargetUid: true },
]
