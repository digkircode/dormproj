import { Prisma, ContractStatus } from '../../generated/prisma/client.js';
import { Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { roomAssignmentAtDate } from './room-assignment-at-date';
import { addDays, dateOnly } from '../billing/period-utils';
import { contractRegistryStatusAtDate } from './contract-registry-status';

const { Decimal } = Prisma;
const logger = new Logger('DebtorRows');

export interface DebtorRow {
  contractId: number;
  contractNumber: string;
  residentIndividualUid: string;
  residentFullName: string;
  room: string | null;
  roomId: number | null;
  status: ContractStatus;
  contractDate: Date;
  endDate: Date;
  totalAccrued: number;
  totalPaid: number;
  principalDebt: number;
  penaltyBalance: number;
  totalBalance: number;
}

export async function buildDebtorRows(prisma: PrismaService, asOf: Date, contractIds?: number[]): Promise<DebtorRow[]> {
  const startedAt = Date.now();
  if (contractIds?.length === 0) return [];
  const contracts = await prisma.contract.findMany({
    where: {
      ...(contractIds ? { id: { in: contractIds } } : {}),
      startDate: { lte: asOf },
    },
    include: {
      resident: { select: { fullName: true, fizicheskoyeLitsoUid: true } },
      roomAssignments: { ...roomAssignmentAtDate(asOf), include: { room: { select: { id: true, room: true } } } },
      accruals: {
        where: { voidedAt: null },
        include: { allocations: { include: { payment: { select: { paidAt: true, reversedAt: true } } } }, refunds: true },
      },
      refunds: { select: { amount: true, creditAmount: true, refundedAt: true } },
    },
  });
  if (contracts.length === 0) return [];

  const ids = contracts.map((contract) => contract.id);
  const [penaltyTotals, paymentTotals, paidPenaltyTotals, paymentAsOfTotals] = await Promise.all([
    prisma.penaltyAccrualLog.groupBy({
      by: ['contractId'], where: { contractId: { in: ids }, date: { lte: asOf } },
      _sum: { amount: true },
    }),
    prisma.payment.groupBy({
      by: ['contractId'], where: { contractId: { in: ids }, reversedAt: null },
      _sum: { amount: true },
    }),
    prisma.payment.groupBy({
      by: ['contractId'], where: { contractId: { in: ids }, reversedAt: null, paidAt: { lte: asOf } },
      _sum: { penaltyAmount: true },
    }),
    prisma.payment.groupBy({
      by: ['contractId'], where: { contractId: { in: ids }, reversedAt: null, paidAt: { lte: asOf } },
      _sum: { amount: true },
    }),
  ]);
  const penaltyByContract = new Map(penaltyTotals.map((row) => [row.contractId, row._sum.amount ?? new Decimal(0)]));
  const paidByContract = new Map(paymentTotals.map((row) => [row.contractId, row._sum.amount ?? new Decimal(0)]));
  const paidPenaltyByContract = new Map(paidPenaltyTotals.map((row) => [row.contractId, row._sum.penaltyAmount ?? new Decimal(0)]));
  const paidAsOfByContract = new Map(paymentAsOfTotals.map((row) => [row.contractId, row._sum.amount ?? new Decimal(0)]));

  const rows: DebtorRow[] = [];
  for (const contract of contracts) {
    let totalAccrued = new Decimal(0);
    let principalDebtAsOf = new Decimal(0);
    let allocatedAsOf = new Decimal(0);
    const totalRefunded = contract.refunds.reduce((sum, refund) => sum.plus(refund.amount), new Decimal(0));

    for (const accrual of contract.accruals) {
      const principal = accrual.rentAmount.plus(accrual.utilitiesAmount).plus(accrual.adjustmentAmount);
      totalAccrued = totalAccrued.plus(principal);
      allocatedAsOf = allocatedAsOf.plus(accrual.allocations
        .filter((allocation) => !allocation.payment.reversedAt && allocation.payment.paidAt <= asOf)
        .reduce((sum, allocation) => sum.plus(allocation.amount), new Decimal(0)));
      if (accrual.dueDate > asOf) continue;

      const paidAsOf = accrual.allocations
        .filter((al) => !al.payment.reversedAt && al.payment.paidAt <= asOf)
        .reduce((sum, al) => sum.plus(al.amount), new Decimal(0))
        .minus(accrual.refunds.filter((refund) => refund.refundedAt <= asOf)
          .reduce((sum, refund) => sum.plus(refund.amount.minus(refund.creditAmount)), new Decimal(0)));
      principalDebtAsOf = principalDebtAsOf.plus(principal.minus(paidAsOf));
    }

    const penaltyBalance = (penaltyByContract.get(contract.id) ?? new Decimal(0))
      .minus(paidPenaltyByContract.get(contract.id) ?? new Decimal(0));
    const returnedCreditAsOf = contract.refunds.filter((refund) => refund.refundedAt <= asOf)
      .reduce((sum, refund) => sum.plus(refund.creditAmount), new Decimal(0));
    const unallocatedCreditAsOf = (paidAsOfByContract.get(contract.id) ?? new Decimal(0))
      .minus(allocatedAsOf)
      .minus(paidPenaltyByContract.get(contract.id) ?? new Decimal(0))
      .minus(returnedCreditAsOf);
    if (unallocatedCreditAsOf.greaterThan(0)) principalDebtAsOf = principalDebtAsOf.minus(unallocatedCreditAsOf);
    const totalPaid = (paidByContract.get(contract.id) ?? new Decimal(0)).minus(totalRefunded);

    const totalBalance = Number(principalDebtAsOf.plus(penaltyBalance));
    rows.push({
      contractId: contract.id,
      contractNumber: contract.number,
      residentIndividualUid: contract.residentIndividualUid,
      residentFullName: contract.resident.fullName,
      room: contract.roomAssignments[0]?.room.room ?? null,
      roomId: contract.roomAssignments[0]?.room.id ?? null,
      status: asOf < dateOnly(new Date())
        ? contractRegistryStatusAtDate(contract, asOf, totalBalance)
        : contract.status,
      contractDate: contract.contractDate,
      endDate: contract.endDate,
      totalAccrued: Number(totalAccrued),
      totalPaid: Number(totalPaid),
      principalDebt: Number(principalDebtAsOf),
      penaltyBalance: Number(penaltyBalance),
      totalBalance,
    });
  }

  const elapsedMs = Date.now() - startedAt;
  if (elapsedMs >= 500) logger.log(`Финансовый отчёт: договоров ${rows.length}, длительность ${elapsedMs} мс`);
  return rows;
}
