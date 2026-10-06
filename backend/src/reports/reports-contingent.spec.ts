import { ReportsController } from './reports.controller';

describe('resident registry with a future student population', () => {
  it('reads only the 1000 residents from 5000 student records', async () => {
    const assignments = Array.from({ length: 1000 }, (_, index) => ({
      id: index + 1, roomId: index + 1,
      fromDate: new Date('2026-01-01T00:00:00Z'),
      room: { room: String(index + 1) },
      contract: {
        id: index + 1, number: String(index + 1), residentIndividualUid: `uid-${index}`,
        resident: { fullName: `Resident ${index}`, birthDate: null, citizenships: [] },
      },
    }));
    const studentRecords = Array.from({ length: 5000 }, (_, index) => ({
      fizicheskoyeLitsoUid: `uid-${index}`, facultet: 'Faculty', kursNumber: 1,
      period: new Date('2026-01-01T00:00:00Z'),
    }));
    const studentFind = jest.fn(async (args: { where: { fizicheskoyeLitsoUid: { in: string[] } } }) =>
      studentRecords.filter((row) => args.where.fizicheskoyeLitsoUid.in.includes(row.fizicheskoyeLitsoUid)));
    const prisma = {
      roomAssignment: { findMany: jest.fn().mockResolvedValue(assignments) },
      student: { findMany: studentFind },
      contract: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const controller = new ReportsController(prisma as never);

    const result = await controller.contingent(undefined, undefined, undefined, undefined, undefined, undefined, '2026-03-01');

    expect(result.total).toBe(1000);
    expect(studentFind.mock.calls[0][0].where.fizicheskoyeLitsoUid.in).toHaveLength(1000);
    expect(prisma.roomAssignment.findMany).toHaveBeenCalledTimes(1);
  });
});
