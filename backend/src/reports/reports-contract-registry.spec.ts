import { ReportsController } from './reports.controller';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe('contracts registry on a selected date', () => {
  it('uses the contract validity interval rather than the database creation date', async () => {
    const records = [
      { id: 1, number: 'BACKDATED', createdAt: day('2026-10-01'), startDate: day('2026-09-01'), endDate: day('2026-09-30'), actualEndDate: null, status: 'ACTIVE' },
      { id: 2, number: 'NOT_STARTED', createdAt: day('2026-09-01'), startDate: day('2026-09-11'), endDate: day('2026-09-30'), actualEndDate: null, status: 'ACTIVE' },
      { id: 3, number: 'COMPLETED', createdAt: day('2026-08-01'), startDate: day('2026-08-01'), endDate: day('2026-09-09'), actualEndDate: null, status: 'COMPLETED' },
      { id: 4, number: 'DEPARTS_TODAY', createdAt: day('2026-08-01'), startDate: day('2026-08-01'), endDate: day('2026-09-30'), actualEndDate: day('2026-09-10'), status: 'TERMINATED' },
      { id: 5, number: 'DEPARTED', createdAt: day('2026-08-01'), startDate: day('2026-08-01'), endDate: day('2026-09-30'), actualEndDate: day('2026-09-09'), status: 'TERMINATED' },
      { id: 6, number: 'ONE_DAY', createdAt: day('2026-10-01'), startDate: day('2026-09-10'), endDate: day('2026-09-10'), actualEndDate: null, status: 'COMPLETED' },
    ];
    const findMany = jest.fn(async ({ where }: { where: {
      startDate: { lte: Date }; endDate: { gte: Date };
      OR: [{ status: { not: string } }, { actualEndDate: { gte: Date } }];
    } }) => records
      .filter((contract) => contract.startDate <= where.startDate.lte
        && contract.endDate >= where.endDate.gte
        && (contract.status !== 'TERMINATED' || (!!contract.actualEndDate && contract.actualEndDate >= where.OR[1].actualEndDate.gte)))
      .map((contract) => ({
        ...contract, residentIndividualUid: 'resident', resident: { fullName: 'Resident' }, roomAssignments: [],
      })));
    const controller = new ReportsController({ contract: { findMany } } as never);

    const result = await controller.contractsRegistry(
      undefined, undefined, undefined, undefined, undefined, undefined, '2026-09-10',
    );

    expect(result.data.map((row) => row.contractId)).toEqual([6, 1, 4]);
    expect(result.data.find((row) => row.contractId === 4)?.bucket).toBe('TERMINATED');
    expect(await controller.contractsRegistrySummary('2026-09-10')).toMatchObject({ expiring30: 2, overdue: 0, ended: 1 });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        startDate: { lte: day('2026-09-10') },
        endDate: { gte: day('2026-09-10') },
        OR: [{ status: { not: 'TERMINATED' } }, { actualEndDate: { gte: day('2026-09-10') } }],
      },
    }));
  });
});
