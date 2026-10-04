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
          adjustmentAmount: new Prisma.Decimal(0), dueDate: date(1), allocations: [],
        }],
        payments: [], penaltyLogs: [],
      }];
    });
    const prisma = { contract: { findMany } } as unknown as PrismaService;

    const departureDay = (await buildDebtorRows(prisma, date(10)))[0];
    const nextDay = (await buildDebtorRows(prisma, date(11)))[0];

    expect([departureDay.room, departureDay.roomId, departureDay.totalBalance]).toEqual(['101', 101, 120]);
    expect([nextDay.room, nextDay.roomId, nextDay.totalBalance]).toEqual(['202', 202, 120]);
  });
});
