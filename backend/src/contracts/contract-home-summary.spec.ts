import { Prisma } from '../../generated/prisma/client.js';
import { buildContractHomeSummary } from './contract-home-summary';

function accrual(dueDate: string, amount: number) {
  return {
    dueDate: new Date(`${dueDate}T00:00:00.000Z`),
    rentAmount: new Prisma.Decimal(amount),
    utilitiesAmount: new Prisma.Decimal(0),
    adjustmentAmount: new Prisma.Decimal(0),
    allocations: [],
    refunds: [],
  };
}

describe('contract home summary payment periods', () => {
  afterEach(() => jest.useRealTimers());

  const contract = {
    number: 'TEST-1',
    createdAt: new Date('2026-10-11T00:00:00.000Z'),
    contractDate: new Date('2026-10-01T00:00:00.000Z'),
    creditBalance: new Prisma.Decimal(0),
    roomAssignments: [],
    accruals: [accrual('2026-10-05', 7000), accrual('2026-11-05', 7000), accrual('2026-12-05', 7000)],
    penaltyLogs: [],
    payments: [],
  };

  it('shows only overdue debt and the next payment including arrears', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-28T12:00:00.000Z'));
    const prisma = { contract: { findFirst: jest.fn().mockResolvedValue(contract) } };

    const summary = await buildContractHomeSummary(prisma as never, { number: 'TEST-1' });

    expect(summary?.contractDate).toEqual(contract.contractDate);
    expect(summary?.overdueBalance).toBe(7000);
    expect(summary?.nextAccrual).toEqual({ dueDate: new Date('2026-11-05T00:00:00.000Z'), balance: 14000 });
  });

  it('moves to the following payment on the day after the due date', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-06T12:00:00.000Z'));
    const prisma = { contract: { findFirst: jest.fn().mockResolvedValue(contract) } };

    const summary = await buildContractHomeSummary(prisma as never, { number: 'TEST-1' });

    expect(summary?.overdueBalance).toBe(14000);
    expect(summary?.nextAccrual).toEqual({ dueDate: new Date('2026-12-05T00:00:00.000Z'), balance: 21000 });
  });

  it('uses the unpaid remainder after a partial payment', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-28T12:00:00.000Z'));
    const partlyPaid = {
      ...contract,
      accruals: [
        { ...contract.accruals[0], allocations: [{ amount: new Prisma.Decimal(3000) }] },
        ...contract.accruals.slice(1),
      ],
    };
    const prisma = { contract: { findFirst: jest.fn().mockResolvedValue(partlyPaid) } };

    const summary = await buildContractHomeSummary(prisma as never, { number: 'TEST-1' });

    expect(summary?.overdueBalance).toBe(4000);
    expect(summary?.nextAccrual?.balance).toBe(11000);
  });
});
