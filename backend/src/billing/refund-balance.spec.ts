import { Prisma } from '../../generated/prisma/client.js';
import { availableAdjustmentRefund } from './refund-balance';

const d = (value: number) => new Prisma.Decimal(value);
const day = (value: number) => new Date(Date.UTC(2026, 9, value));

function scenario(paid: number, refunded = 0, otherDebt = 0) {
  return {
    asOf: day(20), penaltyLogs: [], payments: [],
    accruals: [
      {
        id: 40, periodStart: day(1), voidedAt: null,
        rentAmount: d(14500), utilitiesAmount: d(0), adjustmentAmount: d(-11500),
        allocations: paid ? [{ amount: d(paid), payment: { paidAt: day(5), reversedAt: null } }] : [],
        refunds: refunded ? [{ amount: d(refunded), refundedAt: day(7) }] : [],
      },
      ...(otherDebt ? [{
        id: 41, periodStart: day(1), voidedAt: null,
        rentAmount: d(otherDebt), utilitiesAmount: d(0), adjustmentAmount: d(0),
        allocations: [], refunds: [],
      }] : []),
    ],
  };
}

describe('availableAdjustmentRefund', () => {
  it('does not create a refund when only the recalculated charge was paid', () => {
    expect(availableAdjustmentRefund(scenario(3000))).toBeNull();
  });

  it('allows only the remaining correction amount after a partial refund', () => {
    const available = availableAdjustmentRefund(scenario(14500, 5000));
    expect(available?.accrualId).toBe(40);
    expect(available?.amount.toNumber()).toBe(6500);
  });

  it('does not refund money needed for another unpaid period', () => {
    expect(availableAdjustmentRefund(scenario(14500, 0, 11500))).toBeNull();
  });
});
