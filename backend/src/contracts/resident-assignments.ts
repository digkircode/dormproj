import type { PrismaService } from '../prisma/prisma.service';

// A room is occupied through its departure day. Keep the same date rules for
// the registry and chat, and resolve equal move-in dates deterministically.
export async function currentResidentAssignments(prisma: PrismaService, asOf: Date, liveOnly = false, residentUid?: string) {
  const assignments = await prisma.roomAssignment.findMany({
    where: {
      fromDate: { lte: asOf },
      OR: [{ toDate: null }, { toDate: { gte: asOf } }],
      contract: {
        ...(residentUid ? { residentIndividualUid: residentUid } : {}),
        startDate: { lte: asOf },
        endDate: { gte: asOf },
        OR: [{ actualEndDate: null }, { actualEndDate: { gte: asOf } }],
        ...(liveOnly ? { status: { in: ['ACTIVE' as const, 'EXPIRING' as const] } } : {}),
      },
    },
    include: {
      room: { select: { room: true } },
      contract: {
        select: {
          id: true, number: true, residentIndividualUid: true, startDate: true,
          resident: {
            select: {
              fullName: true, birthDate: true,
              citizenships: { orderBy: { period: 'desc' }, take: 1, select: { country: true } },
            },
          },
        },
      },
    },
    orderBy: [{ fromDate: 'desc' }, { id: 'desc' }],
  });

  const byResident = new Map<string, (typeof assignments)[number]>();
  for (const assignment of assignments) {
    const uid = assignment.contract.residentIndividualUid;
    if (!byResident.has(uid)) byResident.set(uid, assignment);
  }
  return [...byResident.values()];
}
