import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { computePenaltyBalance } from '../billing/penalty-balance';
import { dateOnly } from '../billing/period-utils';
import { pickCurrentCharacteristics } from '../rooms/current-characteristics';

const FLOOR_DEFINITION_NAME = 'Этаж';

export interface ContractHomeSummary {
  number: string;
  createdAt: Date;
  currentRoom: { room: string; floor: number | null } | null;
  totalBalance: number;
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

  const { penaltyBalance } = computePenaltyBalance({
    asOf: dateOnly(new Date()),
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
  const unpaidAccruals = accrualBalances.filter((a) => a.balance.greaterThan(0));
  const nextAccrual = unpaidAccruals[0] ?? null;
  let nextAccrualBalance = nextAccrual?.balance ?? null;
  if (nextAccrual && nextAccrual.dueDate < dateOnly(new Date()) && unpaidAccruals[1]) {
    nextAccrualBalance = nextAccrual.balance.plus(unpaidAccruals[1].balance);
  }

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
    currentRoom,
    totalBalance: Number(totalDebt.plus(penaltyBalance).minus(contract.creditBalance)),
    nextAccrual: nextAccrual ? { dueDate: nextAccrual.dueDate, balance: Number(nextAccrualBalance) } : null,
  };
}
