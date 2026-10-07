import { Prisma } from '../../generated/prisma/client.js';
import { PenaltyScheduler } from './penalty.scheduler';
import { addDays, moscowDateOnly } from './period-utils';
import * as penaltyCalc from './penalty-calc';

jest.mock('./penalty-calc', () => ({
  buildAccrualPenaltyCalcs: jest.fn(),
  earliestPenaltyStartsAt: jest.fn(),
  overdueSumOnDay: jest.fn(),
}));

describe('PenaltyScheduler batching', () => {
  it('commits journal rows and progress together in batches of 50', async () => {
    const today = moscowDateOnly(new Date());
    const contracts = Array.from({ length: 51 }, (_, index) => ({
      id: index + 1, number: String(index + 1), accruals: [],
      penaltyAccruedThrough: addDays(today, -1), matCapitalDeferredUntil: null,
    }));
    jest.mocked(penaltyCalc.earliestPenaltyStartsAt).mockReturnValue(today);
    jest.mocked(penaltyCalc.overdueSumOnDay).mockReturnValue(new Prisma.Decimal(100));
    jest.mocked(penaltyCalc.buildAccrualPenaltyCalcs).mockResolvedValue([{}] as never);

    const findMany = jest.fn()
      .mockResolvedValueOnce(contracts.slice(0, 50))
      .mockResolvedValueOnce(contracts.slice(50))
      .mockResolvedValueOnce([]);
    const createManyAndReturn = jest.fn(async (args: { data: { amount: Prisma.Decimal }[] }) => args.data);
    const updateManyAndReturn = jest.fn(async (args: { where: { id: { in: number[] } } }) =>
      args.where.id.in.map((id) => ({ id })));
    const tx = { penaltyAccrualLog: { createManyAndReturn }, contract: { updateManyAndReturn } };
    const prisma = {
      contract: { findMany },
      $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
      syncLog: { create: jest.fn().mockResolvedValue({ id: 1 }), update: jest.fn().mockResolvedValue({}) },
    };
    const scheduler = new PenaltyScheduler(prisma as never);

    await scheduler.accruePenalties();

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(updateManyAndReturn).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: { not: 'TERMINATED' } }),
    }));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: { not: 'TERMINATED' } }),
    }));
    expect(createManyAndReturn).toHaveBeenCalledTimes(2);
    expect(createManyAndReturn.mock.calls[0][0].data).toHaveLength(50);
    expect(createManyAndReturn.mock.calls[1][0].data).toHaveLength(1);
    expect(prisma.syncLog.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'SUCCESS', details: expect.objectContaining({ processedContracts: 51, penaltyRowsCreated: 51, totalAdded: 7.14 }) }),
    }));
  });

  it('does not write a calculated row if the contract was terminated before the batch commits', async () => {
    const today = moscowDateOnly(new Date());
    jest.mocked(penaltyCalc.earliestPenaltyStartsAt).mockReturnValue(today);
    jest.mocked(penaltyCalc.overdueSumOnDay).mockReturnValue(new Prisma.Decimal(100));
    jest.mocked(penaltyCalc.buildAccrualPenaltyCalcs).mockResolvedValue([{}] as never);
    const findMany = jest.fn()
      .mockResolvedValueOnce([{
        id: 1, number: 'TEST', accruals: [], penaltyAccruedThrough: addDays(today, -1),
        matCapitalDeferredUntil: null,
      }])
      .mockResolvedValueOnce([]);
    const createManyAndReturn = jest.fn();
    const updateManyAndReturn = jest.fn().mockResolvedValue([]);
    const tx = { penaltyAccrualLog: { createManyAndReturn }, contract: { updateManyAndReturn } };
    const prisma = {
      contract: { findMany },
      $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
      syncLog: { create: jest.fn().mockResolvedValue({ id: 1 }), update: jest.fn().mockResolvedValue({}) },
    };

    await new PenaltyScheduler(prisma as never).accruePenalties();

    expect(updateManyAndReturn).toHaveBeenCalledTimes(1);
    expect(createManyAndReturn).not.toHaveBeenCalled();
    expect(prisma.syncLog.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'SUCCESS', details: expect.objectContaining({ processedContracts: 0, penaltyRowsCreated: 0, totalAdded: 0 }) }),
    }));
  });
});
