import type { Prisma } from '../../generated/prisma/client.js';

// A departure date is inclusive. If assignments overlap, use the latest move-in,
// then the highest id, as in the resident registry.
export function roomAssignmentAtDate(asOf: Date) {
  return {
    where: {
      fromDate: { lte: asOf },
      OR: [{ toDate: null }, { toDate: { gte: asOf } }],
    },
    orderBy: [{ fromDate: 'desc' }, { id: 'desc' }],
    take: 1,
  } satisfies Pick<Prisma.RoomAssignmentFindManyArgs, 'where' | 'orderBy' | 'take'>;
}
