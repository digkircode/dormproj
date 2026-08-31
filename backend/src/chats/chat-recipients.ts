import type { Prisma, RoomCharacteristicValueType } from '../../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service';
import { dateOnly } from '../billing/period-utils';
import { buildDebtorRows, type DebtorRow } from '../reports/debtor-rows';
import { fromStoredValue } from '../rooms/characteristic-value';

// Название характеристик комнаты, по которым фильтруется рассылка — "Этаж" уже
// существует (см. reports.controller.ts), "Корпус" в проекте изначально не заведён
// вообще (комнаты — плоский список без уровня "корпус", см. промпт проекта) — заводится
// сотрудниками вручную через уже существующий UI "Характеристики комнат", как обычная
// (не защищённая) характеристика. Ищем по имени и корректно деградируем, если её ещё нет.
const FLOOR_DEFINITION_NAME = 'Этаж';
const CORPUS_DEFINITION_NAME = 'Корпус';

export interface ChatRecipient {
  individualUid: string;
  fullName: string;
  room: string | null;
  floor: string | null;
  corpus: string | null;
  balance: number;
}

export interface ChatRecipientFilters {
  // Несколько этажей сразу (по прямой просьбе — сотруднику может понадобиться разослать
  // сразу на 2-3 этажа) — пусто/не задано = без фильтра. Корпус остался одиночным
  // выбором, множественный не просили.
  floors?: string[];
  corpus?: string;
  debtorsOnly?: boolean;
  search?: string;
  // Явный список получателей по ФИО-поиску ("написать 3 конкретным людям", по прямой
  // просьбе) — если задан, ПОЛНОСТЬЮ заменяет собой floors/corpus/debtorsOnly/search
  // (см. chatRecipients ниже), а не пересекается с ними: раз сотрудник вручную выбрал
  // получателей, фильтры по этажу/долгу для них уже не имеют смысла. Не "доверие клиенту
  // вслепую" — список всё равно пересекается с currentResidents на сервере, adresat не
  // может оказаться человеком, которого там вообще нет.
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

// "Актуальное" значение — макс. period на пару (room, definitionName), тот же приём,
// что currentByRoom в public-info.controller.ts.
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

// Базовая выборка "реальных" проживающих для чата/рассылки — те, у кого прямо сейчас
// действующий договор (ACTIVE или EXPIRING — срок ещё не вышел, см. ContractStatus в
// schema.prisma) с активным заселением в комнату. Сознательно не роль RESIDENT — та
// завязана на весь жизненный цикл договора включая 30-дневный грейс-период после
// естественного завершения (см. resident-role-sync.ts), не привязана к факту проживания/
// комнате — фильтры по этажу/корпусу без комнаты физически не имеют смысла, поэтому
// берём именно эту базу.
// buildDebtorRows отдаёт строку НА ДОГОВОР, не на проживающего — бизнес-правила не
// запрещают явно два одновременных договора одного физлица в разных комнатах
// (редкий случай, но не невозможный), а у чата ровно один диалог на Individual
// (@@unique на individualUid, см. schema.prisma) — дедуп по individualUid здесь,
// чтобы рассылка не отправила такому человеку одно и то же сообщение дважды.
async function currentResidents(prisma: PrismaService): Promise<(DebtorRow & { roomId: number })[]> {
  const rows = await buildDebtorRows(prisma, dateOnly(new Date()));
  const active = rows.filter(
    (r): r is DebtorRow & { roomId: number } => (r.status === 'ACTIVE' || r.status === 'EXPIRING') && r.roomId !== null,
  );

  const byIndividual = new Map<string, DebtorRow & { roomId: number }>();
  for (const row of active) {
    if (!byIndividual.has(row.residentIndividualUid)) {
      byIndividual.set(row.residentIndividualUid, row);
    }
  }
  return [...byIndividual.values()];
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
  const residents = await currentResidents(prisma);
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
    debtorsCount: residents.filter((r) => r.totalBalance > 0).length,
  };
}

// Сервер сам пересчитывает получателей по фильтрам (не доверяет списку uid от клиента
// вслепую — individualUids ниже всё равно пересекается с currentResidents) — и для
// превью, и для реальной отправки вызывается одна и та же функция, чтобы список в
// диалоге и фактические адресаты не могли разойтись.
export async function chatRecipients(prisma: PrismaService, filters: ChatRecipientFilters): Promise<ChatRecipient[]> {
  const residents = await currentResidents(prisma);
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
    .filter((r) => (filters.debtorsOnly ? r.balance > 0 : true))
    .filter((r) => (search ? r.fullName.toLowerCase().includes(search) : true))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));
}
