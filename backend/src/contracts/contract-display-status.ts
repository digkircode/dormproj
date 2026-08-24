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
// местах (тут + фронт + ContractRegistryStatusCell.vue) одинаковыми при правке.
export const CONTRACT_DISPLAY_STATUS_LABELS: Record<ContractDisplayStatus, string> = {
  ACTIVE: 'Действует',
  EXPIRING: 'Истекает',
  TERMINATED: 'Расторгнут',
  EXPIRED: 'Истёк',
};
