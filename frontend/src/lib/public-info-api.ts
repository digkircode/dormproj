import { apiFetch } from './api-base'

export interface HostelPriceRange {
  capacity: number
  min: number
  max: number
}

export interface HostelPublicInfo {
  passRestorationCost: number | null
  guestRoomDailyRate: number | null
  priceRanges: HostelPriceRange[]
}

// Единственный эндпоинт в проекте, доступный любому залогиненному без проверки роли
// (backend/src/public-info/public-info.controller.ts) — питает StudentGeneralInfo.vue,
// реальные числа из БД (характеристики комнат + DormitoryInfo), не текстом руками.
export async function fetchHostelPublicInfo(): Promise<HostelPublicInfo> {
  const response = await apiFetch('/public-info/hostel')
  if (!response.ok) {
    throw new Error(`Не удалось получить справочные данные об общежитии (${response.status})`)
  }
  return response.json()
}
