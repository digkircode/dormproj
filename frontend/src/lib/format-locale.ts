import { i18n } from '@/i18n'
import { today, getLocalTimeZone } from '@internationalized/date'

// Тег для toLocaleDateString/toLocaleString — раньше везде был захардкожен 'ru-RU',
// теперь следует за текущим языком интерфейса (см. i18n/index.ts).
export function dateLocaleTag(): string {
  return i18n.global.locale.value === 'en' ? 'en-GB' : 'ru-RU'
}

// "YYYY-MM-DD" на СЕГОДНЯ по локальному календарю браузера, не UTC (код-ревью 2026-09-04) —
// `new Date().toISOString().slice(0, 10)` в первые часы суток по МСК (до 03:00 летом/до
// 03:00 зимой — UTC ещё "вчера") тихо давал вчерашнюю дату. Тот же приём, что уже
// используется в RoomDetailPanel.vue.
export function todayIso(): string {
  return today(getLocalTimeZone()).toString()
}
