import { ContractStatusScheduler } from './contract-status.scheduler';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ContractStatusScheduler', () => {
  const today = new Date();
  const endDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 10));
  const contract = { id: 42, number: 'Д-42', status: 'ACTIVE', endDate, accruals: [], payments: [], penaltyLogs: [] };

  it('writes a system history entry in the status transaction', async () => {
    const tx = { contract: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, auditLog: { create: jest.fn().mockResolvedValue({}) } };
    const prisma = { contract: { findMany: jest.fn().mockResolvedValue([contract]) }, $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) => fn(tx)) };
    const scheduler = new ContractStatusScheduler(prisma as unknown as PrismaService, new AuditLogService());

    await scheduler.transitionStatuses();

    expect(tx.contract.updateMany).toHaveBeenCalledWith({ where: { id: 42, status: 'ACTIVE' }, data: { status: 'EXPIRING' } });
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: null, entityType: 'Contract', entityId: '42', changes: { status: { before: 'ACTIVE', after: 'EXPIRING' } } }) });
  });

  it('does not write history when a concurrent change already replaced the status', async () => {
    const tx = { contract: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) }, auditLog: { create: jest.fn() } };
    const prisma = { contract: { findMany: jest.fn().mockResolvedValue([contract]) }, $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) => fn(tx)) };
    const scheduler = new ContractStatusScheduler(prisma as unknown as PrismaService, new AuditLogService());

    await scheduler.transitionStatuses();

    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
