import { apiFetch } from './api-base'
import { i18n } from '@/i18n'

export type DormitoryInfoFieldKey =
  | 'communalServicesCost'
  | 'dailyPaymentInternal'
  | 'dailyPaymentOther'
  | 'passRestorationCost'
  | 'guestRoomDailyRate'

export interface DormitoryInfo {
  communalServicesCost: number | null
  dailyPaymentInternal: number | null
  dailyPaymentOther: number | null
  passRestorationCost: number | null
  guestRoomDailyRate: number | null
  updatedAt: string
}

// Общежитские поля — не характеристика конкретной комнаты (клик по корню дерева, не по
// комнате, см. RoomTree.vue), поэтому у них нет открытого каталога, как у комнат
// (RoomCharacteristicDefinition) — ровно эти 3, единственный источник правды на фронте.
// room-characteristic-definitions-api.ts не трогаем — RoomCharacteristics.vue импортирует
// имена отсюда только чтобы запретить заводить характеристику комнаты с таким названием.
export const DORMITORY_INFO_FIELDS: { key: DormitoryInfoFieldKey; name: string; unit: string }[] = [
  { key: 'communalServicesCost', name: 'Коммунальные услуги', unit: '₽' },
  { key: 'dailyPaymentInternal', name: 'Суточная оплата (Вн. вуз.)', unit: '₽' },
  { key: 'dailyPaymentOther', name: 'Суточная оплата (Другой вуз.)', unit: '₽' },
  { key: 'passRestorationCost', name: 'Восстановление пропускного документа', unit: '₽' },
  { key: 'guestRoomDailyRate', name: 'Гостевая стоимость (сутки)', unit: '₽' },
]

export async function fetchDormitoryInfo(): Promise<DormitoryInfo> {
  const response = await apiFetch('/dormitory-info')
  if (!response.ok) {
    throw new Error(i18n.global.t('rooms.errors.fetchDormitoryInfoFailed', { status: response.status }))
  }
  return response.json()
}

export async function updateDormitoryInfo(input: Partial<Record<DormitoryInfoFieldKey, number | null>>): Promise<DormitoryInfo> {
  const response = await apiFetch('/dormitory-info', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}))
    throw new Error(body.message ?? i18n.global.t('rooms.errors.updateDormitoryInfoFailed', { status: response.status }))
  }
  return response.json()
}
