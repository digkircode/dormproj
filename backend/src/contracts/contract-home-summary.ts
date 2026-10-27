import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { computePenaltyBalance } from '../billing/penalty-balance';
import { moscowDateOnly } from '../billing/period-utils';
import { pickCurrentCharacteristics } from '../rooms/current-characteristics';

const FLOOR_DEFINITION_NAME = 'Этаж';

export interface ContractHomeSummary {
  number: string;
  createdAt: Date;
  contractDate: Date;
  currentRoom: { room: string; floor: number | null } | null;
  totalBalance: number;
  overdueBalance: number;
  nextAccrual: { dueDate: Date; balance: number } | null;
}

export async function buildContractHomeSummary(
  prisma: PrismaService,
  where: Prisma.ContractWhereInput,
): Promise<ContractHomeSummary | null> {
  const contract = await prisma.contract.findFirst({
    where,
    orderBy: { contractDate: 'desc' },
    select: {
      number: true,
      createdAt: true,
      contractDate: true,
      creditBalance: true,
      roomAssignments: { orderBy: { fromDate: 'desc' }, select: { toDate: true, room: { select: { id: true, room: true } } } },
      accruals: {
        where: { voidedAt: null },
        orderBy: { periodStart: 'asc' },
        select: { dueDate: true, rentAmount: true, utilitiesAmount: true, adjustmentAmount: true, allocations: { select: { amount: true } }, refunds: { select: { amount: true, creditAmount: true } } },
      },
      penaltyLogs: { select: { amount: true, date: true } },
      payments: { select: { penaltyAmount: true, paidAt: true, reversedAt: true } },
    },
  });
  if (!contract) {
    return null;
  }

  const today = moscowDateOnly(new Date());
  const { penaltyBalance } = computePenaltyBalance({
    asOf: today,
    penaltyLogs: contract.penaltyLogs,
    payments: contract.payments,
  });

  const accrualBalances = contract.accruals.map((a) => {
    const total = a.rentAmount.plus(a.utilitiesAmount).plus(a.adjustmentAmount);
    const paid = a.allocations.reduce((sum, alloc) => sum.plus(alloc.amount), new Prisma.Decimal(0))
      .minus(a.refunds.reduce((sum, refund) => sum.plus(refund.amount.minus(refund.creditAmount)), new Prisma.Decimal(0)));
    return { dueDate: a.dueDate, balance: total.minus(paid) };
  });
  const totalDebt = accrualBalances.reduce((sum, a) => sum.plus(a.balance), new Prisma.Decimal(0));
  const overduePrincipal = accrualBalances
    .filter((a) => a.dueDate < today && a.balance.greaterThan(0))
    .reduce((sum, a) => sum.plus(a.balance), new Prisma.Decimal(0));
  const upcomingAccruals = accrualBalances
    .filter((a) => a.dueDate >= today && a.balance.greaterThan(0))
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  const nextDueDate = upcomingAccruals[0]?.dueDate ?? null;
  const nextDueBalance = nextDueDate
    ? upcomingAccruals
      .filter((a) => a.dueDate.getTime() === nextDueDate.getTime())
      .reduce((sum, a) => sum.plus(a.balance), new Prisma.Decimal(0))
    : new Prisma.Decimal(0);

  const rawCurrentRoom = contract.roomAssignments.find((a) => a.toDate === null)?.room ?? contract.roomAssignments[0]?.room ?? null;
  let currentRoom: { room: string; floor: number | null } | null = null;
  if (rawCurrentRoom) {
    const characteristicValues = await prisma.roomCharacteristicValue.findMany({
      where: { roomId: rawCurrentRoom.id, definition: { name: FLOOR_DEFINITION_NAME } },
      include: { definition: true },
      orderBy: { period: 'desc' },
    });
    const floor = (pickCurrentCharacteristics(characteristicValues)[0]?.value as number | null | undefined) ?? null;
    currentRoom = { room: rawCurrentRoom.room, floor };
  }

  return {
    number: contract.number,
    createdAt: contract.createdAt,
    contractDate: contract.contractDate,
    currentRoom,
    totalBalance: Number(totalDebt.plus(penaltyBalance).minus(contract.creditBalance)),
    overdueBalance: Number(Prisma.Decimal.max(0, overduePrincipal.plus(penaltyBalance).minus(contract.creditBalance))),
    nextAccrual: nextDueDate ? {
      dueDate: nextDueDate,
      balance: Number(Prisma.Decimal.max(0, overduePrincipal.plus(nextDueBalance).minus(contract.creditBalance))),
    } : null,
  };
}
