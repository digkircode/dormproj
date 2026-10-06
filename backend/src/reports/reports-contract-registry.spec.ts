import { buildDebtorRows } from './debtor-rows';
import { ReportsController } from './reports.controller';

jest.mock('./debtor-rows', () => ({ buildDebtorRows: jest.fn() }));

describe('contracts registry on a historical date', () => {
  it('uses the selected date for rows and summary while showing the stored status today', async () => {
    const endDate = new Date('2026-09-10T00:00:00.000Z');
    const findMany = jest.fn().mockResolvedValue([{
      id: 1, number: '123', residentIndividualUid: 'resident-1',
      resident: { fullName: 'Проживающий' }, roomAssignments: [],
      status: 'COMPLETED', createdAt: new Date('2026-09-01T00:00:00.000Z'),
      startDate: new Date('2026-09-01T00:00:00.000Z'), endDate, actualEndDate: null,
    }]);
    jest.mocked(buildDebtorRows).mockResolvedValue([{ contractId: 1, totalBalance: 100 }] as never);
    const controller = new ReportsController({ contract: { findMany } } as never);

    const historical = await controller.contractsRegistry(
      undefined, undefined, undefined, undefined, undefined, undefined, '2026-09-11',
    );
    expect(historical.data[0]?.bucket).toBe('OVERDUE');
    expect(await controller.contractsRegistrySummary('2026-09-11')).toMatchObject({ overdue: 1, ended: 0 });

    const current = await controller.contractsRegistry();
    expect(current.data[0]?.bucket).toBe('COMPLETED');
    expect(buildDebtorRows).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { createdAt: { lt: new Date('2026-09-12T00:00:00.000Z') } },
    }));
  });

  it('excludes contracts created after the selected date', async () => {
    const contracts = [
      { id: 1, number: '1', createdAt: new Date('2026-09-01T12:00:00.000Z') },
      { id: 2, number: '2', createdAt: new Date('2026-09-03T00:00:00.000Z') },
    ];
    const findMany = jest.fn(async ({ where }: any) => contracts
      .filter((contract) => contract.createdAt < where.createdAt.lt)
      .map((contract) => ({
        ...contract, residentIndividualUid: 'resident', resident: { fullName: 'Resident' },
        roomAssignments: [], status: 'ACTIVE', startDate: contract.createdAt,
        endDate: new Date('2026-12-01T00:00:00.000Z'), actualEndDate: null,
      })));
    jest.mocked(buildDebtorRows).mockResolvedValue([{ contractId: 1, totalBalance: 0 }] as never);
    const controller = new ReportsController({ contract: { findMany } } as never);

    const result = await controller.contractsRegistry(
      undefined, undefined, undefined, undefined, undefined, undefined, '2026-09-01',
    );
    expect(result.data.map((row) => row.contractId)).toEqual([1]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { createdAt: { lt: new Date('2026-09-02T00:00:00.000Z') } },
    }));
  });
});
