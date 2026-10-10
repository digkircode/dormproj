import { Prisma } from '../../generated/prisma/client.js';
import { recalculatePenaltyInTransaction } from './penalty-recalculate.service';
import * as penaltyCalc from './penalty-calc';

jest.mock('./penalty-calc', () => ({
  buildAccrualPenaltyCalcs: jest.fn(),
  earliestPenaltyStartsAt: jest.fn(),
  overdueSumOnDay: jest.fn(),
}));

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe('recalculatePenaltyInTransaction', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stops at the termination date and releases payment previously applied to cancelled penalty', async () => {
    const contract = {
      id: 48, number: 'PENALTYTEST', status: 'TERMINATED',
      actualEndDate: day('2026-05-25'), accruals: [], matCapitalDeferredUntil: null,
    };
    jest.mocked(penaltyCalc.buildAccrualPenaltyCalcs).mockResolvedValue([{}] as never);
    jest.mocked(penaltyCalc.earliestPenaltyStartsAt).mockReturnValue(day('2026-06-10'));
    const deleteMany = jest.fn().mockResolvedValue({ count: 119 });
    const createMany = jest.fn();
    const updatePayment = jest.fn().mockResolvedValue({});
    const updateContract = jest.fn().mockResolvedValue({});
    const tx = {
      contract: { findUnique: jest.fn().mockResolvedValue(contract), update: updateContract },
      penaltyAccrualLog: { findMany: jest.fn().mockResolvedValue([]), deleteMany, createMany },
      payment: {
        findMany: jest.fn().mockResolvedValue([{ id: 19, penaltyAmount: new Prisma.Decimal('499.80') }]),
        update: updatePayment,
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };

    const result = await recalculatePenaltyInTransaction(tx as never, 48, day('2026-10-07'));

    expect(result.rowsCreated).toBe(0);
    expect(result.totalAdded.toString()).toBe('0');
    expect(result.changed).toBe(true);
    expect(deleteMany).toHaveBeenCalledWith({ where: { contractId: 48 } });
    expect(createMany).not.toHaveBeenCalled();
    expect(penaltyCalc.overdueSumOnDay).not.toHaveBeenCalled();
    expect(updatePayment).toHaveBeenCalledWith({ where: { id: 19 }, data: { penaltyAmount: new Prisma.Decimal(0) } });
    expect(updateContract).toHaveBeenCalledWith({
      where: { id: 48 }, data: { penaltyAccruedThrough: day('2026-10-07'), creditBalance: { increment: new Prisma.Decimal('499.80') } },
    });
  });

  it('preserves penalty accrued through the termination date only', async () => {
    jest.mocked(penaltyCalc.buildAccrualPenaltyCalcs).mockResolvedValue([{}] as never);
    jest.mocked(penaltyCalc.earliestPenaltyStartsAt).mockReturnValue(day('2026-05-24'));
    jest.mocked(penaltyCalc.overdueSumOnDay).mockReturnValue(new Prisma.Decimal(100));
    const createMany = jest.fn().mockResolvedValue({ count: 2 });
    const tx = {
      contract: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1, number: 'TEST', status: 'TERMINATED', actualEndDate: day('2026-05-25'),
          accruals: [], matCapitalDeferredUntil: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      penaltyAccrualLog: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn().mockResolvedValue({ count: 0 }), createMany },
      payment: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const result = await recalculatePenaltyInTransaction(tx as never, 1, day('2026-10-07'));

    expect(result.rowsCreated).toBe(2);
    expect(result.changed).toBe(true);
    expect(createMany.mock.calls[0][0].data.map((row: { date: Date }) => row.date)).toEqual([
      day('2026-05-24'), day('2026-05-25'),
    ]);
  });

  it('reports no change when the daily penalty journal is identical', async () => {
    jest.mocked(penaltyCalc.buildAccrualPenaltyCalcs).mockResolvedValue([{}] as never);
    jest.mocked(penaltyCalc.earliestPenaltyStartsAt).mockReturnValue(day('2026-05-24'));
    jest.mocked(penaltyCalc.overdueSumOnDay).mockReturnValue(new Prisma.Decimal(100));
    const tx = {
      contract: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1, number: 'TEST', status: 'TERMINATED', actualEndDate: day('2026-05-24'),
          accruals: [], matCapitalDeferredUntil: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      penaltyAccrualLog: {
        findMany: jest.fn().mockResolvedValue([{
          date: day('2026-05-24'), amount: new Prisma.Decimal('0.14'), overdueBase: new Prisma.Decimal(100),
        }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      payment: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const result = await recalculatePenaltyInTransaction(tx as never, 1, day('2026-10-07'));

    expect(result.rowsCreated).toBe(1);
    expect(result.changed).toBe(false);
  });
});
