import { Prisma } from '../../generated/prisma/client.js';
import { serializeAccrual } from './serializers';

const amount = (value: number) => new Prisma.Decimal(value);

describe('serializeAccrual refund display', () => {
  const base = {
    id: 202,
    periodStart: new Date('2026-08-01T00:00:00Z'),
    periodEnd: new Date('2026-08-31T00:00:00Z'),
    dueDate: new Date('2026-08-10T00:00:00Z'),
    rentAmount: amount(8650),
    utilitiesAmount: amount(1100),
    adjustmentAmount: amount(-6250),
    adjustmentReason: null,
    voidedAt: null,
    allocations: [{ amount: amount(9750) }],
  };

  it('marks only the part of a refund deducted from the paid accrual', () => {
    const row = serializeAccrual({
      ...base,
      refunds: [{ amount: amount(1562), creditAmount: amount(1500), adjustmentAmount: amount(62) }],
    });

    expect(row.paid).toBe(9688);
    expect(row.paidRefundedAmount).toBe(62);
    expect(row.balance).toBe(-6188);
  });

  it('does not mark a refund drawn only from free credit', () => {
    const row = serializeAccrual({
      ...base,
      refunds: [{ amount: amount(1500), creditAmount: amount(1500), adjustmentAmount: amount(0) }],
    });

    expect(row.paid).toBe(9750);
    expect(row.paidRefundedAmount).toBe(0);
  });
});
