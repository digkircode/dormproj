import { ContractBenefit, Prisma } from '../../generated/prisma/client.js';

export function resolveContractMonthlyAmounts(params: {
  benefit: ContractBenefit;
  isDailyOnlyRoom: boolean;
  roomCost: Prisma.Decimal;
  utilitiesAmount: Prisma.Decimal;
}): { rentAmount: Prisma.Decimal; utilitiesAmount: Prisma.Decimal } {
  const { benefit, isDailyOnlyRoom, roomCost, utilitiesAmount } = params;
  if (benefit === 'FREE') {
    return { rentAmount: new Prisma.Decimal(0), utilitiesAmount: new Prisma.Decimal(0) };
  }
  if (benefit === 'PARTIAL') {
    return { rentAmount: new Prisma.Decimal(0), utilitiesAmount };
  }
  if (isDailyOnlyRoom) {
    return { rentAmount: new Prisma.Decimal(0), utilitiesAmount: new Prisma.Decimal(0) };
  }
  return { rentAmount: roomCost.minus(utilitiesAmount), utilitiesAmount };
}
