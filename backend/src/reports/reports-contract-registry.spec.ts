import { buildDebtorRows } from './debtor-rows';
import { ReportsController } from './reports.controller';

jest.mock('./debtor-rows', () => ({ buildDebtorRows: jest.fn() }));

describe('contracts registry on a historical date', () => {
  it('uses the selected date for rows and summary while keeping the current stored status', async () => {
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
  });
});
