import { I18nContext } from 'nestjs-i18n';
import type { ContractStatus } from '../../generated/prisma/client.js';

export const CONTRACT_STATUS_VALUES: ContractStatus[] = ['ACTIVE', 'EXPIRING', 'OVERDUE', 'COMPLETED', 'TERMINATED'];

const RU_FALLBACK: Record<ContractStatus, string> = {
  ACTIVE: 'Действует',
  EXPIRING: 'Истекает',
  OVERDUE: 'Просрочен',
  COMPLETED: 'Завершён',
  TERMINATED: 'Расторгнут',
};
export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = new Proxy(RU_FALLBACK, {
  get: (_target, status: string) => I18nContext.current()?.t(`contracts.status.${status}`) ?? RU_FALLBACK[status as ContractStatus],
});
