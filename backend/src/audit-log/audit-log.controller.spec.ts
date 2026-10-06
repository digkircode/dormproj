import { AuditLogController } from './audit-log.controller';

describe('AuditLogController.list', () => {
  it('shows names in historical room characteristic reorder records without changing stored JSON', async () => {
    const changes = { order: { before: ['Этаж', 'Корпус'], after: [17, 11] } };
    const findDefinitions = jest.fn().mockResolvedValue([{ id: 17, name: 'Корпус' }, { id: 11, name: 'Этаж' }]);
    const prisma = {
      auditLog: {
        findMany: jest.fn().mockResolvedValue([{
          id: 1, user: null, action: 'UPDATE', entityType: 'RoomCharacteristicDefinition',
          entityId: 'order', entityLabel: 'Порядок характеристик комнат', changes,
          createdAt: new Date('2026-10-01T00:00:00Z'),
        }]),
        count: jest.fn().mockResolvedValue(1),
      },
      roomCharacteristicDefinition: { findMany: findDefinitions },
    };

    const result = await new AuditLogController(prisma as never).list();

    expect(result.data[0]?.changes).toEqual({ order: { before: ['Этаж', 'Корпус'], after: ['Корпус', 'Этаж'] } });
    expect(changes.order.after).toEqual([17, 11]);
    expect(findDefinitions).toHaveBeenCalledWith({ where: { id: { in: [17, 11] } }, select: { id: true, name: true } });
  });
});
