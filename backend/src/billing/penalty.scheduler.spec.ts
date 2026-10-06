import { Prisma } from '../../generated/prisma/client.js';
import { PenaltyScheduler } from './penalty.scheduler';
import { addDays, dateOnly } from './period-utils';
import * as penaltyCalc from './penalty-calc';

jest.mock('./penalty-calc', () => ({
  buildAccrualPenaltyCalcs: jest.fn(),
  earliestPenaltyStartsAt: jest.fn(),
  overdueSumOnDay: jest.fn(),
}));

describe('PenaltyScheduler batching', () => {
  it('commits journal rows and progress together in batches of 50', async () => {
    const today = dateOnly(new Date());
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
    const updateMany = jest.fn().mockResolvedValue({ count: 50 });
    const tx = { penaltyAccrualLog: { createManyAndReturn }, contract: { updateMany } };
    const prisma = {
      contract: { findMany },
      $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
      syncLog: { create: jest.fn().mockResolvedValue({ id: 1 }), update: jest.fn().mockResolvedValue({}) },
    };
    const scheduler = new PenaltyScheduler(prisma as never);

    await scheduler.accruePenalties();

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(createManyAndReturn).toHaveBeenCalledTimes(2);
    expect(createManyAndReturn.mock.calls[0][0].data).toHaveLength(50);
    expect(createManyAndReturn.mock.calls[1][0].data).toHaveLength(1);
    expect(prisma.syncLog.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'SUCCESS', details: expect.objectContaining({ processedContracts: 51, penaltyRowsCreated: 51, totalAdded: 7.14 }) }),
    }));
  });
});
