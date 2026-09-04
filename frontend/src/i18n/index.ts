import { createI18n } from 'vue-i18n'
import ruCommon from './locales/ru/common.json'
import enCommon from './locales/en/common.json'
import ruContracts from './locales/ru/contracts.json'
import enContracts from './locales/en/contracts.json'
import ruPayment from './locales/ru/payment.json'
import enPayment from './locales/en/payment.json'
import ruRooms from './locales/ru/rooms.json'
import enRooms from './locales/en/rooms.json'
import ruIndividuals from './locales/ru/individuals.json'
import enIndividuals from './locales/en/individuals.json'
import ruUsers from './locales/ru/users.json'
import enUsers from './locales/en/users.json'
import ruReports from './locales/ru/reports.json'
import enReports from './locales/en/reports.json'
import ruSync from './locales/ru/sync.json'
import enSync from './locales/en/sync.json'
import ruChat from './locales/ru/chat.json'
import enChat from './locales/en/chat.json'
import ruStudent from './locales/ru/student.json'
import enStudent from './locales/en/student.json'
import ruAnnouncements from './locales/ru/announcements.json'
import enAnnouncements from './locales/en/announcements.json'
import ruPaymentImports from './locales/ru/paymentImports.json'
import enPaymentImports from './locales/en/paymentImports.json'
import ruServiceProvisionDocuments from './locales/ru/serviceProvisionDocuments.json'
import enServiceProvisionDocuments from './locales/en/serviceProvisionDocuments.json'

export type AppLocale = 'ru' | 'en'
export const LOCALE_STORAGE_KEY = 'dormproj-locale'

// Обычная функция, не composable — используется и вне компонентов (api-base.ts,
// главный модуль до монтирования приложения), поэтому не может опираться на useI18n().
export function getStoredLocale(): AppLocale {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY)
    return raw === 'en' ? 'en' : 'ru'
  } catch {
    return 'ru'
  }
}

export const i18n = createI18n({
  legacy: false,
  locale: getStoredLocale(),
  fallbackLocale: 'ru',
  messages: {
    ru: { ...ruCommon, ...ruContracts, ...ruPayment, ...ruRooms, ...ruIndividuals, ...ruUsers, ...ruReports, ...ruSync, ...ruChat, ...ruStudent, ...ruAnnouncements, ...ruPaymentImports, ...ruServiceProvisionDocuments },
    en: { ...enCommon, ...enContracts, ...enPayment, ...enRooms, ...enIndividuals, ...enUsers, ...enReports, ...enSync, ...enChat, ...enStudent, ...enAnnouncements, ...enPaymentImports, ...enServiceProvisionDocuments },
  },
})
