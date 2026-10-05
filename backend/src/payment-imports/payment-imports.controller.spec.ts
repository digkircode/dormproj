import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { allocatePaymentFifo } from '../billing/payment-allocation';
import { PaymentImportsController } from './payment-imports.controller';

jest.mock('../billing/payment-allocation', () => ({ allocatePaymentFifo: jest.fn() }));

describe('PaymentImportsController.approve', () => {
  it('creates one payment when the same import is approved concurrently, and rejects a retry', async () => {
    const importedAt = new Date('2026-09-04T12:00:00.000Z');
    const rawPayload = {
      DocumentUID: 'payment-1', ContractorUID: 'resident-1', ContractUID: 'contract-1',
      DocumentSumm: '100', Type: 'Поступление наличных',
    };
    let committed = false;
    let claimed = false;
    let releaseFirst!: () => void;
    const firstFinished = new Promise<void>((resolve) => { releaseFirst = resolve; });

    const payment = {
      id: 42, contractId: 7, amount: new Prisma.Decimal(100), paidAt: importedAt,
      method: 'CASH', source: 'IMPORTED_1C', externalRef: 'payment-1', rawComment: null,
      reversedAt: null, createdAt: importedAt,
    };
    const createPayment = jest.fn().mockResolvedValue(payment);
    const updateRecord = jest.fn().mockResolvedValue({ id: 3, status: 'MATCHED', resultingPaymentId: 42 });
    const log = jest.fn().mockResolvedValue(undefined);
    const tx = {
      paymentImportRecord: {
        updateMany: jest.fn().mockImplementation(async () => {
          if (claimed) {
            await firstFinished;
            return { count: 0 };
          }
          claimed = true;
          return { count: 1 };
        }),
        update: updateRecord,
      },
      user: { upsert: jest.fn().mockResolvedValue({ id: 9 }) },
      payment: { create: createPayment },
    };
    const prisma = {
      paymentImportRecord: {
        findUnique: jest.fn().mockImplementation(async () => ({
          id: 3, status: committed ? 'MATCHED' : 'NEEDS_REVIEW',
          externalId: 'payment-1', rawPayload, importedAt,
        })),
      },
      contract: {
        findMany: jest.fn().mockResolvedValue([{ id: 7 }]),
        findUnique: jest.fn().mockResolvedValue({ id: 7, number: '123' }),
      },
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
        try {
          const result = await callback(tx);
          committed = true;
          return result;
        } finally {
          if (committed) releaseFirst();
        }
      },
    };
    const controller = new PaymentImportsController(prisma as never, { log } as never);
    const request = { user: { id: 9, fullName: 'Сотрудник' } } as never;

    const results = await Promise.allSettled([
      controller.approve('3', request),
      controller.approve('3', request),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.status).toBe('rejected');
    if (rejected?.status === 'rejected') {
      expect(rejected.reason).toBeInstanceOf(BadRequestException);
      expect(rejected.reason.message).toBe('paymentImports.errors.alreadyReviewed');
    }
    expect(tx.paymentImportRecord.updateMany).toHaveBeenCalledWith({
      where: { id: 3, status: 'NEEDS_REVIEW' }, data: { status: 'MATCHED' },
    });
    expect(createPayment).toHaveBeenCalledTimes(1);
    expect(allocatePaymentFifo).toHaveBeenCalledTimes(1);
    expect(updateRecord).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);

    await expect(controller.approve('3', request)).rejects.toThrow('paymentImports.errors.alreadyReviewed');
    expect(createPayment).toHaveBeenCalledTimes(1);
  });
});
