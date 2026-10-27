import { apiFetch } from './api-base'
import { i18n } from '@/i18n'

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

export async function fetchHostelPublicInfo(): Promise<HostelPublicInfo> {
  const response = await apiFetch('/public-info/hostel')
  if (!response.ok) {
    throw new Error(i18n.global.t('student.errors.fetchHostelInfoFailed', { status: response.status }))
  }
  return response.json()
}
