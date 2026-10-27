import { Prisma } from '../../generated/prisma/client.js';
import { reconcilePaymentHistoryInTransaction } from './payment-history-reconciliation';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const money = (value: number) => new Prisma.Decimal(value);

describe('reconcilePaymentHistoryInTransaction', () => {
  it('removes a stale credit after the last payment was reversed', async () => {
    const update = jest.fn().mockResolvedValue({});
    const tx = {
      contract: { findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 3, number: 'TEST', status: 'ACTIVE', accruals: [],
        creditBalance: money(50), matCapitalDeferredUntil: null,
      }), update },
      payment: { findMany: jest.fn().mockResolvedValue([]) },
      contractRefund: { findMany: jest.fn().mockResolvedValue([]) },
    };

    expect(await reconcilePaymentHistoryInTransaction(tx as never, 3, day('2026-03-15'))).toBe(true);
    expect(update).toHaveBeenCalledWith({ where: { id: 3 }, data: { creditBalance: money(0) } });
  });

  it('assigns a payment entered later to the earlier month when its payment date is earlier', async () => {
    const january = {
      id: 1, periodStart: day('2026-01-01'), periodEnd: day('2026-01-31'),
      rentAmount: money(100), utilitiesAmount: money(0), adjustmentAmount: money(0),
    };
    const february = { ...january, id: 2, periodStart: day('2026-02-01'), periodEnd: day('2026-02-28') };
    const lateEntered = {
      id: 2, amount: money(100), paidAt: day('2026-01-20'), penaltyAmount: money(0),
      allocations: [{ accrualId: 2, amount: money(100), isPartial: false }],
    };
    const firstEntered = {
      id: 1, amount: money(100), paidAt: day('2026-03-01'), penaltyAmount: money(0),
      allocations: [{ accrualId: 1, amount: money(100), isPartial: false }],
    };
    const createMany = jest.fn().mockResolvedValue({ count: 2 });
    const tx = {
      contract: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 3, number: 'TEST', status: 'ACTIVE', accruals: [january, february],
          matCapitalDeferredUntil: null, matCapitalCoveredFrom: null, matCapitalCoveredTo: null,
          creditBalance: money(0),
        }),
      },
      contractTerms: { findFirst: jest.fn().mockResolvedValue({ rentAmount: money(100), utilitiesAmount: money(0) }) },
      payment: { findMany: jest.fn().mockResolvedValue([lateEntered, firstEntered]) },
      contractRefund: { findMany: jest.fn().mockResolvedValue([]) },
      paymentAllocation: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }), createMany },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };

    const changed = await reconcilePaymentHistoryInTransaction(tx as never, 3, day('2026-03-15'));

    expect(changed).toBe(true);
    expect(createMany).toHaveBeenCalledWith({ data: [
      { paymentId: 2, accrualId: 1, amount: money(100), isPartial: false },
      { paymentId: 1, accrualId: 2, amount: money(100), isPartial: false },
    ] });
    expect(tx.auditLog.create).toHaveBeenCalledTimes(2);
  });
});
