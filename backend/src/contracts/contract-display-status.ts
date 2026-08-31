import { I18nContext } from 'nestjs-i18n';
import type { ContractStatus } from '../../generated/prisma/client.js';

// До 2026-08-31 EXPIRING/OVERDUE не были реальными значениями ContractStatus в БД — этот
// файл на лету вычислял "отображаемый" статус по датам (EXPIRED так и не проставлялся
// автоматически, см. историю проекта). С тех пор ContractStatus сам по себе — полный
// жизненный цикл (ACTIVE/EXPIRING/OVERDUE/COMPLETED/TERMINATED, см. schema.prisma,
// переходы считает billing/contract-status.scheduler.ts), поэтому вычислять уже нечего —
// этот файл остался только как общая таблица переводов статуса под текущий язык запроса.
export const CONTRACT_STATUS_VALUES: ContractStatus[] = ['ACTIVE', 'EXPIRING', 'OVERDUE', 'COMPLETED', 'TERMINATED'];

// Та же подпись, что STATUS_LABELS на фронте (contracts-format.ts) — держать в трёх
// местах (тут + фронт + ContractStatusCell.vue) одинаковыми при правке. Значения
// резолвятся через nestjs-i18n (backend/i18n/{ru,en}/contracts.json#status) под язык
// текущего запроса (I18nContext.current() — AsyncLocalStorage, работает без явного
// прокидывания контекста, см. HeaderResolver в app.module.ts); фолбэк на русский —
// для вызовов вне HTTP-запроса (например, крон).
const RU_FALLBACK: Record<ContractStatus, string> = {
  ACTIVE: 'Действует',
  EXPIRING: 'Истекает',
  OVERDUE: 'Просрочен',
  COMPLETED: 'Завершён',
  TERMINATED: 'Расторгнут',
};
// Proxy-таргет — сам RU_FALLBACK (не пустой {}), иначе Object.keys(CONTRACT_STATUS_LABELS)
// (см. reports.controller.ts#debtorsFacets) возвращал бы [] — ownKeys-ловушка по умолчанию
// форвардится на реальные ключи target, а не get-ловушку.
export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = new Proxy(RU_FALLBACK, {
  get: (_target, status: string) => I18nContext.current()?.t(`contracts.status.${status}`) ?? RU_FALLBACK[status as ContractStatus],
});
