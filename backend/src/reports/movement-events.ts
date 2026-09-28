import { addDays } from '../billing/period-utils';

export type MovementOperationType = 'IN' | 'OUT' | 'MOVE' | 'RENEWAL';

export interface MovementEvent {
  date: Date;
  contractId: number;
  contractNumber: string;
  residentIndividualUid: string;
  residentFullName: string;
  operation: MovementOperationType;
  from: string | null;
  to: string | null;
}

export interface MovementContract {
  id: number;
  number: string;
  residentIndividualUid: string;
  startDate: Date;
  endDate: Date;
  actualEndDate: Date | null;
  resident: { fullName: string };
  roomAssignments: { id: number; fromDate: Date; toDate: Date | null; room: { room: string } }[];
}

const GAP_DAYS = 30;

function effectiveEnd(contract: MovementContract): Date {
  return contract.actualEndDate ?? contract.endDate;
}

function roomAt(contract: MovementContract, date: Date): string | null {
  const assignments = contract.roomAssignments
    .filter((assignment) => assignment.fromDate <= date)
    .sort((a, b) => b.fromDate.getTime() - a.fromDate.getTime() || b.id - a.id);
  return assignments.find((assignment) => assignment.toDate === null || assignment.toDate >= date)?.room.room
    ?? assignments[0]?.room.room ?? null;
}

export function buildMovementEvents(contracts: MovementContract[]): MovementEvent[] {
  const byResident = new Map<string, MovementContract[]>();
  for (const contract of contracts) {
    const list = byResident.get(contract.residentIndividualUid) ?? [];
    list.push(contract);
    byResident.set(contract.residentIndividualUid, list);
  }

  const events: MovementEvent[] = [];
  for (const list of byResident.values()) {
    for (const contract of list) {
      const start = contract.startDate;
      const end = effectiveEnd(contract);
      if (end < start) continue;
      const room = roomAt(contract, start);
      const meta = {
        contractId: contract.id, contractNumber: contract.number,
        residentIndividualUid: contract.residentIndividualUid,
        residentFullName: contract.resident.fullName,
      };

      // A previous contract must have started before this one and have been
      // valid during the preceding 30 days (or still be valid on start).
      const previous = list
        .filter((other) => other.id !== contract.id && other.startDate < start && effectiveEnd(other) >= other.startDate
          && effectiveEnd(other) >= addDays(start, -GAP_DAYS))
        .sort((a, b) => Math.min(start.getTime(), effectiveEnd(b).getTime()) - Math.min(start.getTime(), effectiveEnd(a).getTime())
          || b.startDate.getTime() - a.startDate.getTime() || b.id - a.id)[0];
      if (!previous) {
        events.push({ date: start, operation: 'IN', from: null, to: room, ...meta });
      } else {
        const previousRoom = roomAt(previous, previous.startDate < start && effectiveEnd(previous) >= start ? start : effectiveEnd(previous));
        events.push({ date: start, operation: previousRoom === room ? 'RENEWAL' : 'MOVE', from: previousRoom, to: room, ...meta });
      }

      // Any other contract continuing past this end or starting within the
      // following 30 days prevents a move-out event.
      const continues = list.some((other) => other.id !== contract.id
        && other.startDate <= addDays(end, GAP_DAYS) && effectiveEnd(other) > end);
      if (!continues) events.push({ date: end, operation: 'OUT', from: roomAt(contract, end), to: null, ...meta });
    }
  }
  return events;
}
