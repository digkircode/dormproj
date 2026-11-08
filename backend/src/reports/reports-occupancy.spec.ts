import { Prisma } from '../../generated/prisma/client.js';
import { ReportsController } from './reports.controller';

describe('occupancy room characteristics', () => {
  it('returns contingent, area and both prices on the selected date', async () => {
    const definitions = new Map([
      ['Этаж', 1],
      ['Количество мест', 2],
      ['Контингент', 19],
      ['Площадь', 4],
      ['Стоимость (из вуза)', 5],
      ['Стоимость (не из вуза)', 6],
    ]);
    const decimal = (value: number) => new Prisma.Decimal(value);
    const roomFindMany = jest.fn().mockResolvedValue([{
      id: 10,
      room: '101',
      characteristicValues: [
        { definitionId: 1, valueBool: null, valueNumber: decimal(2), valueText: null },
        { definitionId: 2, valueBool: null, valueNumber: decimal(3), valueText: null },
        { definitionId: 19, valueBool: null, valueNumber: null, valueText: 'Женская' },
        { definitionId: 4, valueBool: null, valueNumber: new Prisma.Decimal('18.5'), valueText: null },
        { definitionId: 5, valueBool: null, valueNumber: decimal(12000), valueText: null },
        { definitionId: 6, valueBool: null, valueNumber: decimal(15000), valueText: null },
      ],
      roomAssignments: [],
    }]);
    const prisma = {
      roomCharacteristicDefinition: {
        findUnique: jest.fn(async ({ where }: { where: { name: string } }) => ({ id: definitions.get(where.name) })),
      },
      room: { findMany: roomFindMany },
    };
    const controller = new ReportsController(prisma as never);

    const result = await controller.occupancy('2026-11-08');

    expect(result.floors[0].rooms[0]).toMatchObject({
      room: '101',
      contingent: 'Женская',
      area: 18.5,
      ownUniversityPrice: 12000,
      otherUniversityPrice: 15000,
      free: 3,
    });
    expect(roomFindMany.mock.calls[0][0].include.characteristicValues.where.period.lt)
      .toEqual(new Date('2026-11-09T00:00:00Z'));
  });
});
