import { buildMovementEvents, type MovementContract } from './movement-events';

const date = (day: number) => new Date(Date.UTC(2026, 0, day));
function contract(id: number, start: number, end: number, room: string, actualEnd?: number): MovementContract {
  return {
    id, number: String(id), residentIndividualUid: 'person', resident: { fullName: 'Resident' },
    startDate: date(start), endDate: date(end), actualEndDate: actualEnd ? date(actualEnd) : null,
    roomAssignments: [{ id, fromDate: date(start), toDate: actualEnd ? date(actualEnd) : null, room: { room } }],
  };
}

describe('movement events', () => {
  it('counts a 30-day gap as renewal and a 31-day gap as new occupancy', () => {
    const within = buildMovementEvents([contract(1, 1, 5, '101'), contract(2, 35, 50, '101')]);
    expect(within.map((event) => [event.contractId, event.operation])).toEqual([[1, 'IN'], [2, 'RENEWAL'], [2, 'OUT']]);
    const beyond = buildMovementEvents([contract(1, 1, 5, '101'), contract(2, 36, 50, '101')]);
    expect(beyond.map((event) => [event.contractId, event.operation])).toEqual([[1, 'IN'], [1, 'OUT'], [2, 'IN'], [2, 'OUT']]);
  });

  it('detects a move and compares the room occupied at the prior contract end', () => {
    const previous = contract(1, 1, 20, '101');
    previous.roomAssignments = [
      { id: 1, fromDate: date(1), toDate: date(10), room: { room: '101' } },
      { id: 2, fromDate: date(11), toDate: null, room: { room: '202' } },
    ];
    const events = buildMovementEvents([previous, contract(2, 25, 40, '202'), contract(3, 45, 60, '303')]);
    expect(events.filter((event) => event.operation === 'RENEWAL').map((event) => event.contractId)).toEqual([2]);
    expect(events.filter((event) => event.operation === 'MOVE').map((event) => [event.contractId, event.from, event.to])).toEqual([[3, '202', '303']]);
  });

  it('uses actual departure and does not mark move-out while another contract continues', () => {
    const early = contract(1, 1, 80, '101', 10);
    const next = contract(2, 20, 50, '202');
    expect(buildMovementEvents([early, next]).map((event) => event.operation)).toEqual(['IN', 'MOVE', 'OUT']);
    const overlapping = buildMovementEvents([contract(1, 1, 20, '101'), contract(2, 10, 50, '101')]);
    expect(overlapping.filter((event) => event.operation === 'OUT').map((event) => event.contractId)).toEqual([2]);
  });
});
