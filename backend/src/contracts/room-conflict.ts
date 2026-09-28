import type { Prisma } from '../../generated/prisma/client.js';

type ExistingStay = {
  fromDate: Date;
  toDate: Date | null;
  contract: { startDate: Date; endDate: Date; actualEndDate: Date | null };
};

// A shared departure/arrival date is allowed for a move; an overlap beyond
// that boundary means the resident would occupy two different rooms.
export function hasConflictingStay(start: Date, end: Date, stays: ExistingStay[]): boolean {
  return stays.some((stay) => {
    const occupiedFrom = Math.max(stay.fromDate.getTime(), stay.contract.startDate.getTime());
    const occupiedThrough = Math.min(
      stay.toDate?.getTime() ?? Infinity,
      (stay.contract.actualEndDate ?? stay.contract.endDate).getTime(),
    );
    if (start.getTime() === end.getTime()) {
      return occupiedFrom <= start.getTime() && occupiedThrough >= start.getTime()
        && (occupiedFrom === start.getTime() || occupiedThrough > start.getTime());
    }
    return occupiedFrom < end.getTime() && occupiedThrough > start.getTime();
  });
}

export async function conflictingRoomAssignment(
  tx: Prisma.TransactionClient, residentUid: string, roomId: number, start: Date, end: Date,
): Promise<boolean> {
  const stays = await tx.roomAssignment.findMany({
    where: {
      roomId: { not: roomId }, fromDate: { lt: end },
      OR: [{ toDate: null }, { toDate: { gt: start } }],
      contract: { residentIndividualUid: residentUid, startDate: { lt: end } },
    },
    select: {
      fromDate: true, toDate: true,
      contract: { select: { startDate: true, endDate: true, actualEndDate: true } },
    },
  });
  return hasConflictingStay(start, end, stays);
}
