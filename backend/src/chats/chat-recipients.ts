import type { Prisma, RoomCharacteristicValueType } from '../../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service';
import { dateOnly } from '../billing/period-utils';
import { buildDebtorRows } from '../reports/debtor-rows';
import { fromStoredValue } from '../rooms/characteristic-value';
import { currentResidentAssignments } from '../contracts/resident-assignments';

const FLOOR_DEFINITION_NAME = 'Этаж';
const CORPUS_DEFINITION_NAME = 'Корпус';

export interface ChatRecipient {
  individualUid: string;
  fullName: string;
  room: string | null;
  floor: string | null;
  corpus: string | null;
  balance: number | null;
}

export interface ChatRecipientFilters {
  floors?: string[];
  corpus?: string;
  debtorsOnly?: boolean;
  search?: string;
  individualUids?: string[];
}

export interface ChatRecipientFacets {
  floors: string[];
  corpuses: string[];
  corpusAvailable: boolean;
  totalCount: number;
  debtorsCount: number;
}

interface CharacteristicRow {
  roomId: number;
  period: Date;
  valueBool: boolean | null;
  valueNumber: Prisma.Decimal | null;
  valueText: string | null;
  definition: { name: string; valueType: RoomCharacteristicValueType };
}

function currentByRoom(rows: CharacteristicRow[], definitionName: string): Map<number, CharacteristicRow> {
  const result = new Map<number, CharacteristicRow>();
  for (const row of rows) {
    if (row.definition.name !== definitionName) continue;
    const current = result.get(row.roomId);
    if (!current || row.period > current.period) {
      result.set(row.roomId, row);
    }
  }
  return result;
}

async function currentResidents(prisma: PrismaService, includeBalance: boolean) {
  const asOf = dateOnly(new Date());
  const assignments = await currentResidentAssignments(prisma, asOf, true);
  const rows = includeBalance
    ? await buildDebtorRows(prisma, asOf, [...new Set(assignments.map((a) => a.contract.id))])
    : [];
  const byContract = new Map(rows.map((row) => [row.contractId, row]));
  return assignments.map((assignment) => ({
    residentIndividualUid: assignment.contract.residentIndividualUid,
    residentFullName: assignment.contract.resident.fullName,
    room: assignment.room.room,
    roomId: assignment.roomId,
    totalBalance: byContract.get(assignment.contract.id)?.totalBalance ?? null,
  }));
}

async function loadCharacteristics(prisma: PrismaService, roomIds: number[]) {
  if (roomIds.length === 0) {
    return { floorByRoom: new Map<number, CharacteristicRow>(), corpusByRoom: new Map<number, CharacteristicRow>(), corpusAvailable: false };
  }

  const [corpusDefinition, values] = await Promise.all([
    prisma.roomCharacteristicDefinition.findUnique({ where: { name: CORPUS_DEFINITION_NAME } }),
    prisma.roomCharacteristicValue.findMany({
      where: { roomId: { in: roomIds }, definition: { name: { in: [FLOOR_DEFINITION_NAME, CORPUS_DEFINITION_NAME] } } },
      select: {
        roomId: true,
        period: true,
        valueBool: true,
        valueNumber: true,
        valueText: true,
        definition: { select: { name: true, valueType: true } },
      },
    }),
  ]);

  return {
    floorByRoom: currentByRoom(values, FLOOR_DEFINITION_NAME),
    corpusByRoom: currentByRoom(values, CORPUS_DEFINITION_NAME),
    corpusAvailable: corpusDefinition !== null,
  };
}

function characteristicText(row: CharacteristicRow | undefined): string | null {
  if (!row) return null;
  const value = fromStoredValue(row.definition.valueType, row);
  return value === null ? null : String(value);
}

export async function chatRecipientFacets(prisma: PrismaService): Promise<ChatRecipientFacets> {
  const residents = await currentResidents(prisma, true);
  const roomIds = [...new Set(residents.map((r) => r.roomId))];
  const { floorByRoom, corpusByRoom, corpusAvailable } = await loadCharacteristics(prisma, roomIds);

  const floors = new Set<string>();
  const corpuses = new Set<string>();
  for (const roomId of roomIds) {
    const floor = characteristicText(floorByRoom.get(roomId));
    if (floor !== null) floors.add(floor);
    const corpus = characteristicText(corpusByRoom.get(roomId));
    if (corpus !== null) corpuses.add(corpus);
  }

  return {
    floors: [...floors].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true })),
    corpuses: [...corpuses].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true })),
    corpusAvailable,
    totalCount: residents.length,
    debtorsCount: residents.filter((r) => (r.totalBalance ?? 0) > 0).length,
  };
}

export async function chatRecipients(prisma: PrismaService, filters: ChatRecipientFilters): Promise<ChatRecipient[]> {
  const residents = await currentResidents(prisma, filters.debtorsOnly === true && !filters.individualUids?.length);
  const roomIds = [...new Set(residents.map((r) => r.roomId))];
  const { floorByRoom, corpusByRoom } = await loadCharacteristics(prisma, roomIds);

  const mapped = residents.map((r) => ({
    individualUid: r.residentIndividualUid,
    fullName: r.residentFullName,
    room: r.room,
    floor: characteristicText(floorByRoom.get(r.roomId)),
    corpus: characteristicText(corpusByRoom.get(r.roomId)),
    balance: r.totalBalance,
  }));

  if (filters.individualUids?.length) {
    const picked = new Set(filters.individualUids);
    return mapped.filter((r) => picked.has(r.individualUid)).sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));
  }

  const search = filters.search?.trim().toLowerCase();
  const floors = filters.floors?.length ? new Set(filters.floors) : null;

  return mapped
    .filter((r) => (floors ? r.floor !== null && floors.has(r.floor) : true))
    .filter((r) => (filters.corpus ? r.corpus === filters.corpus : true))
    .filter((r) => (filters.debtorsOnly ? (r.balance ?? 0) > 0 : true))
    .filter((r) => (search ? r.fullName.toLowerCase().includes(search) : true))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));
}
