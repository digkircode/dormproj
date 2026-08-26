import { i18n } from '@/i18n'

// Тег для toLocaleDateString/toLocaleString — раньше везде был захардкожен 'ru-RU',
// теперь следует за текущим языком интерфейса (см. i18n/index.ts).
export function dateLocaleTag(): string {
  return i18n.global.locale.value === 'en' ? 'en-GB' : 'ru-RU'
}
