import type { Prisma } from '../../generated/prisma/client.js';
import { BadRequestException } from '@nestjs/common';
type Stay = { fromDate: Date; toDate: Date | null; contract: { endDate: Date; actualEndDate: Date | null } };

export async function roomAvailability(tx: Prisma.TransactionClient, roomId: number, start: Date, end: Date) {
  const value = await tx.roomCharacteristicValue.findFirst({
    where: { roomId, definition: { name: 'Количество мест' } },
    orderBy: [{ period: 'desc' }, { id: 'desc' }],
  });
  const capacity = Number(value?.valueNumber ?? 0);
  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    throw new BadRequestException({ message: 'Укажите количество мест в карточке комнаты', fieldErrors: { roomId: 'В карточке комнаты не настроено количество мест' } });
  }
  const stays = await tx.roomAssignment.findMany({
    where: { roomId, fromDate: { lte: end }, OR: [{ toDate: null }, { toDate: { gte: start } }] },
    include: { contract: { select: { endDate: true, actualEndDate: true } } },
  });
  const occupied = peakOccupancy(start, end, stays);
  return { capacity, occupied, available: Math.max(0, capacity - occupied) };
}

// Closed intervals: the departure day still occupies a place.
export function peakOccupancy(start: Date, end: Date, stays: Stay[]): number {
  const events = new Map<number, number>();
  for (const stay of stays) {
    const from = Math.max(start.getTime(), stay.fromDate.getTime());
    const to = Math.min(end.getTime(), stay.toDate?.getTime() ?? Infinity,
      (stay.contract.actualEndDate ?? stay.contract.endDate).getTime());
    if (from > to) continue;
    events.set(from, (events.get(from) ?? 0) + 1);
    events.set(to + 1, (events.get(to + 1) ?? 0) - 1);
  }
  let occupied = 0;
  let peak = 0;
  for (const [, delta] of [...events].sort(([a], [b]) => a - b)) {
    occupied += delta;
    peak = Math.max(peak, occupied);
  }
  return peak;
}
