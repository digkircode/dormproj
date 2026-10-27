import type { Prisma } from '../../generated/prisma/client.js';
import { moscowDateOnly } from './period-utils';

export async function flagHistoricalPenaltyRecalculation(
  tx: Prisma.TransactionClient,
  contractId: number,
  paidAt: Date,
): Promise<void> {
  if (moscowDateOnly(paidAt) > moscowDateOnly(new Date())) return;
  await tx.contract.updateMany({
    where: { id: contractId },
    data: { penaltyRecalcPending: true, penaltyRecalcRevision: { increment: 1 } },
  });
}
