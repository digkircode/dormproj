import { Prisma } from '../../generated/prisma/client.js';
import { ServiceProvisionDocService } from './service-provision-doc.service';

const { Decimal } = Prisma;

describe('ServiceProvisionDocService penalty document', () => {
  it('uses monthly contract totals without losing decimal precision or changing detail order', async () => {
    const monthStart = new Date('2026-08-01T00:00:00.000Z');
    const nextMonthStart = new Date('2026-09-01T00:00:00.000Z');
    const groupBy = jest.fn().mockResolvedValue([
      { contractId: 2, _sum: { amount: new Decimal('0.30') } },
      { contractId: 5, _sum: { amount: new Decimal('1.25') } },
      { contractId: 9, _sum: { amount: new Decimal('0.00') } },
    ]);
    const findMany = jest.fn().mockResolvedValue([
      { id: 5, number: '5', residentIndividualUid: 'person-5', accounting1cUid: 'contract-5', resident: { fullName: 'Пятый', accounting1cContractorUid: 'contractor-5' } },
      { id: 9, number: '9', residentIndividualUid: 'person-9', accounting1cUid: null, resident: { fullName: 'Девятый', accounting1cContractorUid: null } },
      { id: 2, number: '2', residentIndividualUid: 'person-2', accounting1cUid: null, resident: { fullName: 'Второй', accounting1cContractorUid: null } },
    ]);
    const prisma = {
      $transaction: jest.fn((callback: (tx: unknown) => Promise<unknown>) => callback({
        penaltyAccrualLog: { groupBy },
        contract: { findMany },
      })),
    };
    const service = new ServiceProvisionDocService(prisma as never, {} as never);

    const lines = await service['collectPenaltyLines'](monthStart, nextMonthStart);
    const document = service['buildDetails'](lines, (line) => line.penalty);

    expect(groupBy).toHaveBeenCalledWith({
      by: ['contractId'],
      where: { date: { gte: monthStart, lt: nextMonthStart } },
      _sum: { amount: true },
      orderBy: { contractId: 'asc' },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: [2, 5, 9] } },
    }));
    expect(lines.map((line) => line.penalty.toFixed(2))).toEqual(['0.30', '1.25', '0.00']);
    expect(document.total.toFixed(2)).toBe('1.55');
    expect(document.details.map((detail) => [detail.SiteContractID, detail.SummDetails])).toEqual([
      [2, 0.3],
      [5, 1.25],
    ]);
    expect(document.details[0].MissingMappings).toEqual(['CONTRACTOR', 'CONTRACT']);
  });

  it('fails if a contract disappears instead of silently understating the document', async () => {
    const prisma = {
      $transaction: (callback: (tx: unknown) => Promise<unknown>) => callback({
        penaltyAccrualLog: { groupBy: async () => [{ contractId: 3, _sum: { amount: new Decimal('2.00') } }] },
        contract: { findMany: async () => [] },
      }),
    };
    const service = new ServiceProvisionDocService(prisma as never, {} as never);

    await expect(service['collectPenaltyLines'](
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-09-01T00:00:00.000Z'),
    )).rejects.toThrow('Не удалось собрать пеню по договору ID 3');
  });
});
