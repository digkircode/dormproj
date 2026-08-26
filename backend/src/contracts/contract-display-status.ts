import { I18nContext } from 'nestjs-i18n';
import type { ContractStatus } from '../../generated/prisma/client.js';

// Порог/правило — синхронизированы с фронтом (frontend/src/lib/contracts-format.ts#getContractDisplayStatus),
// править обе копии разом. EXPIRING — НЕ значение ContractStatus в БД (EXPIRED никогда
// не проставляется автоматически, см. промпт проекта) — вычисляемый бакет только там,
// где статус в таблице уже показывается посчитанным: список /contracts и Финансовый
// отчёт (см. contracts.controller.ts#list/reports.controller.ts#debtors).
export const EXPIRING_WINDOW_DAYS = 30;

export type ContractDisplayStatus = ContractStatus | 'EXPIRING';

// daysUntilEnd < 0 (endDate уже прошёл, а сотрудник ещё не расторг договор — известный
// гэп "автоматического EXPIRED нет") сознательно НЕ считается EXPIRING здесь — остаётся
// ACTIVE, тем же приёмом, что и на фронте. Отдельный бакет OVERDUE для этого случая есть
// только в "Реестре договоров" (reports.controller.ts#buildContractRegistryRows), это
// другое место и не трогается этой функцией.
export function getContractDisplayStatus(status: ContractStatus, endDate: Date, asOf: Date): ContractDisplayStatus {
  if (status !== 'ACTIVE') return status;
  const daysUntilEnd = Math.round((endDate.getTime() - asOf.getTime()) / 86_400_000);
  if (daysUntilEnd >= 0 && daysUntilEnd <= EXPIRING_WINDOW_DAYS) return 'EXPIRING';
  return status;
}

// Та же подпись, что STATUS_LABELS на фронте (contracts-format.ts) — держать в трёх
// местах (тут + фронт + ContractRegistryStatusCell.vue) одинаковыми при правке. Значения
// резолвятся через nestjs-i18n (backend/i18n/{ru,en}/contracts.json#status) под язык
// текущего запроса (I18nContext.current() — AsyncLocalStorage, работает без явного
// прокидывания контекста, см. HeaderResolver в app.module.ts); фолбэк на русский —
// для вызовов вне HTTP-запроса (например, будущий cron), где i18n-контекста нет.
const RU_FALLBACK: Record<ContractDisplayStatus, string> = {
  ACTIVE: 'Действует',
  EXPIRING: 'Истекает',
  TERMINATED: 'Расторгнут',
  EXPIRED: 'Истёк',
};
// Proxy-таргет — сам RU_FALLBACK (не пустой {}), иначе Object.keys(CONTRACT_DISPLAY_STATUS_LABELS)
// (см. reports.controller.ts#debtorsFacets) возвращал бы [] — ownKeys-ловушка по умолчанию
// форвардится на реальные ключи target, а не get-ловушку.
export const CONTRACT_DISPLAY_STATUS_LABELS: Record<ContractDisplayStatus, string> = new Proxy(RU_FALLBACK, {
  get: (_target, status: string) => I18nContext.current()?.t(`contracts.status.${status}`) ?? RU_FALLBACK[status as ContractDisplayStatus],
});
