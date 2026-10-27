import { i18n } from '@/i18n'
import { today, getLocalTimeZone } from '@internationalized/date'

export function dateLocaleTag(): string {
  return i18n.global.locale.value === 'en' ? 'en-GB' : 'ru-RU'
}

export function todayIso(): string {
  return today(getLocalTimeZone()).toString()
}
