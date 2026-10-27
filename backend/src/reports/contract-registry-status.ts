import type { ContractStatus } from '../../generated/prisma/client.js';
import { addDays } from '../billing/period-utils';

export function contractRegistryStatusAtDate(contract: {
  status: ContractStatus;
  endDate: Date;
  actualEndDate: Date | null;
}, asOf: Date, balance: number): ContractStatus {
  if (contract.status === 'TERMINATED' && (!contract.actualEndDate || contract.actualEndDate <= asOf)) {
    return 'TERMINATED';
  }
  if (contract.endDate < asOf) {
    return balance > 0 ? 'OVERDUE' : 'COMPLETED';
  }
  return contract.endDate <= addDays(asOf, 30) ? 'EXPIRING' : 'ACTIVE';
}
