import { ContractStatus, Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service';
import { buildDebtorRows } from './debtor-rows';

const date = (day: number) => new Date(Date.UTC(2026, 0, day));

describe('financial report room on a historical date', () => {
  it('uses the room occupied on the selected day, including the departure day', async () => {
    const assignments = [
      { id: 1, fromDate: date(1), toDate: date(10), room: { id: 101, room: '101' } },
      { id: 2, fromDate: date(11), toDate: null, room: { id: 202, room: '202' } },
    ];
    const findMany = jest.fn(async (args: any) => {
      const { where, orderBy, take } = args.include.roomAssignments;
      const selected = assignments
        .filter((assignment) => assignment.fromDate <= where.fromDate.lte
          && (assignment.toDate === null || assignment.toDate >= where.OR[1].toDate.gte))
        .sort((a, b) => b.fromDate.getTime() - a.fromDate.getTime() || b.id - a.id)
        .slice(0, take);
      expect(orderBy).toEqual([{ fromDate: 'desc' }, { id: 'desc' }]);
      return [{
        id: 1, number: '1', residentIndividualUid: 'resident',
        resident: { fullName: 'Resident', fizicheskoyeLitsoUid: 'resident' },
        roomAssignments: selected, status: ContractStatus.ACTIVE,
        createdAt: date(1), endDate: date(31),
        accruals: [{
          rentAmount: new Prisma.Decimal(100), utilitiesAmount: new Prisma.Decimal(20),
          adjustmentAmount: new Prisma.Decimal(0), dueDate: date(1), allocations: [], refunds: [],
        }],
        refunds: [], payments: [], penaltyLogs: [],
      }];
    });
    const penaltyGroupBy = jest.fn().mockResolvedValue([]);
    const paymentGroupBy = jest.fn().mockResolvedValue([]);
    const prisma = {
      contract: { findMany },
      penaltyAccrualLog: { groupBy: penaltyGroupBy },
      payment: { groupBy: paymentGroupBy },
    } as unknown as PrismaService;

    const departureDay = (await buildDebtorRows(prisma, date(10)))[0];
    const nextDay = (await buildDebtorRows(prisma, date(11)))[0];

    expect([departureDay.room, departureDay.roomId, departureDay.totalBalance]).toEqual(['101', 101, 120]);
    expect([nextDay.room, nextDay.roomId, nextDay.totalBalance]).toEqual(['202', 202, 120]);
    expect(penaltyGroupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: { contractId: { in: [1] }, date: { lte: date(10) } },
    }));
  });

  it('uses database sums while preserving the historical debt and lifetime payment totals', async () => {
    const findMany = jest.fn().mockResolvedValue([{
      id: 1, number: '1', residentIndividualUid: 'resident',
      resident: { fullName: 'Resident', fizicheskoyeLitsoUid: 'resident' },
      roomAssignments: [], status: ContractStatus.ACTIVE,
      createdAt: date(1), endDate: date(31),
      accruals: [{
        rentAmount: new Prisma.Decimal(100), utilitiesAmount: new Prisma.Decimal(20),
        adjustmentAmount: new Prisma.Decimal(0), dueDate: date(1),
        allocations: [{ amount: new Prisma.Decimal(30), payment: { paidAt: date(2), reversedAt: null } }],
        refunds: [],
      }],
      refunds: [],
    }]);
    const paymentGroupBy = jest.fn()
      .mockResolvedValueOnce([{ contractId: 1, _sum: { amount: new Prisma.Decimal(80) } }])
      .mockResolvedValueOnce([{ contractId: 1, _sum: { penaltyAmount: new Prisma.Decimal(5) } }])
      .mockResolvedValueOnce([{ contractId: 1, _sum: { amount: new Prisma.Decimal(30) } }]);
    const prisma = {
      contract: { findMany },
      penaltyAccrualLog: { groupBy: jest.fn().mockResolvedValue([{ contractId: 1, _sum: { amount: new Prisma.Decimal(12) } }]) },
      payment: { groupBy: paymentGroupBy },
    } as unknown as PrismaService;

    const [row] = await buildDebtorRows(prisma, date(3), [1]);
    expect([row.totalAccrued, row.totalPaid, row.principalDebt, row.penaltyBalance, row.totalBalance])
      .toEqual([120, 80, 90, 7, 97]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: [1] }, createdAt: { lt: date(4) } },
    }));
    expect(paymentGroupBy).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { contractId: { in: [1] }, reversedAt: null },
    }));
    expect(paymentGroupBy).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { contractId: { in: [1] }, reversedAt: null, paidAt: { lte: date(3) } },
    }));
  });

  it('counts a recorded refund only from its date in historical debt and nets it from lifetime payments', async () => {
    const prisma = {
      contract: { findMany: jest.fn().mockResolvedValue([{
        id: 1, number: '1', residentIndividualUid: 'resident',
        resident: { fullName: 'Resident', fizicheskoyeLitsoUid: 'resident' },
        roomAssignments: [], status: ContractStatus.ACTIVE,
        createdAt: date(1), endDate: date(31),
        accruals: [{
          rentAmount: new Prisma.Decimal(100), utilitiesAmount: new Prisma.Decimal(0),
          adjustmentAmount: new Prisma.Decimal(-50), dueDate: date(1),
          allocations: [{ amount: new Prisma.Decimal(100), payment: { paidAt: date(2), reversedAt: null } }],
          refunds: [{ amount: new Prisma.Decimal(50), creditAmount: new Prisma.Decimal(0), refundedAt: date(4) }],
        }],
        refunds: [{ amount: new Prisma.Decimal(50), creditAmount: new Prisma.Decimal(0), refundedAt: date(4) }],
      }]) },
      penaltyAccrualLog: { groupBy: jest.fn().mockResolvedValue([]) },
      payment: { groupBy: jest.fn().mockImplementation(async (args: any) =>
        args._sum.amount ? [{ contractId: 1, _sum: { amount: new Prisma.Decimal(100) } }] : []) },
    } as unknown as PrismaService;

    const before = (await buildDebtorRows(prisma, date(3)))[0];
    const after = (await buildDebtorRows(prisma, date(5)))[0];
    expect([before.totalPaid, before.principalDebt, after.totalPaid, after.principalDebt]).toEqual([50, -50, 50, 0]);
  });

  it('includes unallocated contract credit until that credit is returned', async () => {
    const prisma = {
      contract: { findMany: jest.fn().mockResolvedValue([{
        id: 1, number: '1', residentIndividualUid: 'resident',
        resident: { fullName: 'Resident', fizicheskoyeLitsoUid: 'resident' },
        roomAssignments: [], status: ContractStatus.ACTIVE,
        createdAt: date(1), endDate: date(31),
        accruals: [{
          rentAmount: new Prisma.Decimal(100), utilitiesAmount: new Prisma.Decimal(0),
          adjustmentAmount: new Prisma.Decimal(-50), dueDate: date(1),
          allocations: [{ amount: new Prisma.Decimal(50), payment: { paidAt: date(2), reversedAt: null } }],
          refunds: [{ amount: new Prisma.Decimal(50), creditAmount: new Prisma.Decimal(50), refundedAt: date(4) }],
        }],
        refunds: [{ amount: new Prisma.Decimal(50), creditAmount: new Prisma.Decimal(50), refundedAt: date(4) }],
      }]) },
      penaltyAccrualLog: { groupBy: jest.fn().mockResolvedValue([]) },
      payment: { groupBy: jest.fn().mockImplementation(async (args: any) =>
        args._sum.amount ? [{ contractId: 1, _sum: { amount: new Prisma.Decimal(100) } }] : []) },
    } as unknown as PrismaService;

    const before = (await buildDebtorRows(prisma, date(3)))[0];
    const after = (await buildDebtorRows(prisma, date(5)))[0];
    expect([before.totalPaid, before.principalDebt, after.totalPaid, after.principalDebt]).toEqual([50, -50, 50, 0]);
  });

  it('excludes contracts created after the selected day and restores a past status', async () => {
    const contracts = [
      { id: 1, number: '1', createdAt: date(1), status: ContractStatus.COMPLETED },
      { id: 2, number: '2', createdAt: date(5), status: ContractStatus.ACTIVE },
    ];
    const findMany = jest.fn(async ({ where }: any) => contracts
      .filter((contract) => contract.createdAt < where.createdAt.lt)
      .map((contract) => ({
        ...contract, residentIndividualUid: 'resident',
        resident: { fullName: 'Resident', fizicheskoyeLitsoUid: 'resident' },
        roomAssignments: [], endDate: date(10), actualEndDate: null,
        accruals: [], refunds: [],
      })));
    const prisma = {
      contract: { findMany },
      penaltyAccrualLog: { groupBy: jest.fn().mockResolvedValue([]) },
      payment: { groupBy: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;

    const rows = await buildDebtorRows(prisma, date(3));
    expect(rows.map((row) => [row.contractId, row.status])).toEqual([[1, ContractStatus.EXPIRING]]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { createdAt: { lt: date(4) } },
    }));
  });
});
