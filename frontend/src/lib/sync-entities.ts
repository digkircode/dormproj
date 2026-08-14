export interface SyncEntity {
  slug: string
  name: string
  basePath: string
}

export const SYNC_ENTITIES: SyncEntity[] = [
  { slug: 'students', name: 'Контингент студентов', basePath: '/sync/students' },
  { slug: 'individuals', name: 'Физические лица', basePath: '/sync/individuals' },
  { slug: 'citizenship', name: 'Гражданство', basePath: '/sync/citizenship' },
  { slug: 'passport', name: 'Паспортные данные', basePath: '/sync/passport' },
  { slug: 'contact-info', name: 'Контактная информация', basePath: '/sync/contact-info' },
]
