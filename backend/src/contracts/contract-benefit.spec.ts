import { Prisma } from '../../generated/prisma/client.js';
import { resolveContractMonthlyAmounts } from './contract-benefit';

const decimal = (value: number) => new Prisma.Decimal(value);

function amounts(benefit: 'NONE' | 'PARTIAL' | 'FREE', isDailyOnlyRoom = false) {
  const result = resolveContractMonthlyAmounts({
    benefit,
    isDailyOnlyRoom,
    roomCost: decimal(12000),
    utilitiesAmount: decimal(1500),
  });
  return [result.rentAmount.toNumber(), result.utilitiesAmount.toNumber()];
}

describe('contract benefits', () => {
  it('keeps regular rent and utilities without a benefit', () => {
    expect(amounts('NONE')).toEqual([10500, 1500]);
  });

  it('charges only utilities for partial payment, including daily-only rooms', () => {
    expect(amounts('PARTIAL')).toEqual([0, 1500]);
    expect(amounts('PARTIAL', true)).toEqual([0, 1500]);
  });

  it('makes monthly charges zero for free accommodation', () => {
    expect(amounts('FREE')).toEqual([0, 0]);
    expect(amounts('FREE', true)).toEqual([0, 0]);
  });

  it('preserves zero monthly amounts for a daily-only room without a benefit', () => {
    expect(amounts('NONE', true)).toEqual([0, 0]);
  });
});
