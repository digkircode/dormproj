import type { PrismaService } from '../prisma/prisma.service';
import { chatRecipients } from './chat-recipients';

describe('broadcast recipient selection at the resident limit', () => {
  it('handles 20 simultaneous staff searches across 1000 residents without reading financial history', async () => {
    const assignments = Array.from({ length: 1000 }, (_, index) => ({
      roomId: index + 1,
      fromDate: new Date('2026-01-01T00:00:00Z'),
      id: index + 1,
      room: { room: String(index + 1) },
      contract: {
        id: index + 1, number: String(index + 1), residentIndividualUid: `uid-${index}`,
        resident: { fullName: `Resident ${index}`, birthDate: null, citizenships: [] },
      },
    }));
    const findAssignments = jest.fn().mockResolvedValue(assignments);
    const financialFind = jest.fn();
    const prisma = {
      roomAssignment: { findMany: findAssignments },
      contract: { findMany: financialFind },
      roomCharacteristicDefinition: { findUnique: jest.fn().mockResolvedValue(null) },
      roomCharacteristicValue: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;

    const results = await Promise.all(Array.from({ length: 20 }, () => chatRecipients(prisma, {})));

    expect(results.every((recipients) => recipients.length === 1000)).toBe(true);
    expect(results[0][0].balance).toBeNull();
    expect(financialFind).not.toHaveBeenCalled();
    expect(findAssignments).toHaveBeenCalledTimes(20);
  });
});
