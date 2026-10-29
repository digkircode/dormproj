import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';


const CAPACITY_DEFINITION_NAME = 'Количество мест';
const OWN_UNIVERSITY_PRICE_NAME = 'Стоимость (из вуза)';
const OTHER_UNIVERSITY_PRICE_NAME = 'Стоимость (не из вуза)';
const GUEST_DEFINITION_NAME = 'Гостевая';

interface CharacteristicValueRow {
  roomId: number;
  period: Date;
  valueNumber: import('../../generated/prisma/client.js').Prisma.Decimal | null;
  valueBool: boolean | null;
  definition: { name: string };
}

function currentByRoom(rows: CharacteristicValueRow[], definitionName: string): Map<number, CharacteristicValueRow> {
  const result = new Map<number, CharacteristicValueRow>();
  for (const row of rows) {
    if (row.definition.name !== definitionName) continue;
    const current = result.get(row.roomId);
    if (!current || row.period > current.period) {
      result.set(row.roomId, row);
    }
  }
  return result;
}

@Controller('public-info')
@UseGuards(AuthGuard)
export class PublicInfoController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('hostel')
  async hostel() {
    const [dormitoryInfo, values] = await Promise.all([
      this.prisma.dormitoryInfo.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} }),
      this.prisma.roomCharacteristicValue.findMany({
        where: {
          definition: {
            name: { in: [CAPACITY_DEFINITION_NAME, OWN_UNIVERSITY_PRICE_NAME, OTHER_UNIVERSITY_PRICE_NAME, GUEST_DEFINITION_NAME] },
          },
        },
        select: { roomId: true, period: true, valueNumber: true, valueBool: true, definition: { select: { name: true } } },
      }),
    ]);

    const capacityByRoom = currentByRoom(values, CAPACITY_DEFINITION_NAME);
    const ownPriceByRoom = currentByRoom(values, OWN_UNIVERSITY_PRICE_NAME);
    const otherPriceByRoom = currentByRoom(values, OTHER_UNIVERSITY_PRICE_NAME);
    const guestByRoom = currentByRoom(values, GUEST_DEFINITION_NAME);

    const pricesByCapacity = new Map<number, number[]>();
    for (const [roomId, capacityRow] of capacityByRoom) {
      if (guestByRoom.get(roomId)?.valueBool) continue;
      const capacity = capacityRow.valueNumber === null ? null : Number(capacityRow.valueNumber);
      if (capacity === null) continue;
      const prices: number[] = [];
      const own = ownPriceByRoom.get(roomId)?.valueNumber;
      const other = otherPriceByRoom.get(roomId)?.valueNumber;
      if (own !== null && own !== undefined) prices.push(Math.round(Number(own)));
      if (other !== null && other !== undefined) prices.push(Math.round(Number(other)));
      if (prices.length === 0) continue;
      const list = pricesByCapacity.get(capacity) ?? [];
      list.push(...prices);
      pricesByCapacity.set(capacity, list);
    }

    const priceRanges = [...pricesByCapacity.entries()]
      .map(([capacity, prices]) => ({ capacity, min: Math.min(...prices), max: Math.max(...prices) }))
      .sort((a, b) => a.capacity - b.capacity);

    return {
      passRestorationCost: dormitoryInfo.passRestorationCost === null ? null : Math.round(Number(dormitoryInfo.passRestorationCost)),
      guestRoomDailyRate: dormitoryInfo.guestRoomDailyRate === null ? null : Math.round(Number(dormitoryInfo.guestRoomDailyRate)),
      priceRanges,
    };
  }
}
