import { Prisma } from '../../generated/prisma/client.js';
import { accrualPaidNetOfRefunds, availableContractRefund, contractOverpayment } from './refund-balance';

const d = (value: number) => new Prisma.Decimal(value);
const day = (value: number) => new Date(Date.UTC(2026, 9, value));

function scenario(paid: number, refunded = 0, otherDebt = 0, allocated = paid) {
  return {
    creditBalance: d(paid - allocated),
    asOf: day(20), penaltyLogs: [],
    payments: paid ? [{ amount: d(paid), penaltyAmount: d(0), paidAt: day(5), reversedAt: null }] : [],
    refunds: refunded ? [{ amount: d(refunded), refundedAt: day(7) }] : [],
    accruals: [
      {
        id: 40, periodStart: day(1), voidedAt: null,
        rentAmount: d(14500), utilitiesAmount: d(0), adjustmentAmount: d(-11500),
        allocations: allocated ? [{ amount: d(allocated), payment: { paidAt: day(5), reversedAt: null } }] : [],
        refunds: refunded ? [{ amount: d(refunded), creditAmount: d(0), adjustmentAmount: d(refunded), refundedAt: day(7) }] : [],
      },
      ...(otherDebt ? [{
        id: 41, periodStart: day(1), voidedAt: null,
        rentAmount: d(otherDebt), utilitiesAmount: d(0), adjustmentAmount: d(0),
        allocations: [], refunds: [],
      }] : []),
    ],
  };
}

describe('availableContractRefund', () => {
  it('does not create a refund when only the recalculated charge was paid', () => {
    expect(availableContractRefund(scenario(3000))).toBeNull();
  });

  it('allows only the remaining correction amount after a partial refund', () => {
    const available = availableContractRefund(scenario(14500, 5000));
    expect(available?.accrualId).toBe(40);
    expect(available?.amount.toNumber()).toBe(6500);
  });

  it('does not refund money needed for another unpaid period', () => {
    expect(availableContractRefund(scenario(14500, 0, 11500))).toBeNull();
  });

  it('allows a refund when the excess payment stayed in contract credit', () => {
    const available = availableContractRefund(scenario(14500, 0, 0, 3000));
    expect(available?.amount.toNumber()).toBe(11500);
    expect(available?.accrualId).toBeNull();
  });

  it('does not label a later extra payment as a refunded adjustment', () => {
    const available = availableContractRefund(scenario(10750, 0, 0, 3000));
    expect(available?.amount.toNumber()).toBe(7750);
    expect(available?.accrualId).toBeNull();
    expect(available?.remainingCorrection.toNumber()).toBe(0);
  });

  it('allows a single refund of both an adjustment and additional credit', () => {
    const available = availableContractRefund(scenario(20000, 0, 0, 14500));
    expect(contractOverpayment(scenario(20000, 0, 0, 14500)).toNumber()).toBe(17000);
    expect(available?.amount.toNumber()).toBe(17000);
    expect(available?.remainingCorrection.toNumber()).toBe(11500);
  });

  it('clears the full overpayment without reducing the paid accrual below its charge', () => {
    const input = scenario(20000, 0, 0, 14500);
    input.refunds.push({ amount: d(17000), refundedAt: day(20) });
    input.accruals[0].refunds.push({ amount: d(17000), creditAmount: d(5500), adjustmentAmount: d(11500), refundedAt: day(20) });
    input.creditBalance = d(0);
    expect(contractOverpayment(input).toNumber()).toBe(0);
    expect(accrualPaidNetOfRefunds(input.accruals[0]).toNumber()).toBe(3000);
    expect(availableContractRefund(input)).toBeNull();
  });

  it('allows refunding a pure overpayment without an adjustment', () => {
    const input = scenario(3500, 0, 0, 3000);
    input.accruals[0].adjustmentAmount = d(0);
    input.accruals[0].rentAmount = d(3000);
    expect(availableContractRefund(input)).toMatchObject({ accrualId: null, amount: d(500) });
  });

  it('can return overallocated money even when no correction is linked', () => {
    const input = scenario(3500, 0, 0, 3500);
    input.accruals[0].adjustmentAmount = d(0);
    input.accruals[0].rentAmount = d(3000);
    expect(availableContractRefund(input)).toMatchObject({ accrualId: 40, amount: d(500), remainingCorrection: d(0) });
  });
});
