import { Accounting1cPushScheduler } from '../billing/accounting-1c-push.scheduler';
import { ServiceProvisionDocScheduler } from '../billing/service-provision-doc.scheduler';
import { PaymentImportsIngestScheduler } from '../payment-imports/payment-imports-ingest.scheduler';

describe('accounting automatic run settings', () => {
  it('skips a disabled payment push without creating a log or contacting accounting', async () => {
    const prisma = {
      syncJobSetting: { findUnique: jest.fn().mockResolvedValue({ enabled: false }) },
      syncLog: { create: jest.fn() },
    };
    const push = { pushPayments: jest.fn() };
    const provider = { isConfigured: jest.fn() };

    await new Accounting1cPushScheduler(push as never, prisma as never, provider as never).pushPayments();

    expect(prisma.syncJobSetting.findUnique).toHaveBeenCalledWith({
      where: { jobId: 'accounting-payment-push' }, select: { enabled: true },
    });
    expect(prisma.syncLog.create).not.toHaveBeenCalled();
    expect(push.pushPayments).not.toHaveBeenCalled();
  });

  it('skips a disabled payment import without creating a log or fetching payments', async () => {
    const prisma = {
      syncJobSetting: { findUnique: jest.fn().mockResolvedValue({ enabled: false }) },
      syncLog: { create: jest.fn() },
    };
    const ingest = { ingest: jest.fn() };

    await new PaymentImportsIngestScheduler(ingest as never, prisma as never).ingest();

    expect(prisma.syncLog.create).not.toHaveBeenCalled();
    expect(ingest.ingest).not.toHaveBeenCalled();
  });

  it('independently skips disabled document preparation, sending, and startup recovery', async () => {
    const prisma = {
      syncJobSetting: { findUnique: jest.fn().mockResolvedValue({ enabled: false }) },
      syncLog: { create: jest.fn() },
    };
    const service = { computeAndSave: jest.fn(), retryUnsyncedMonth: jest.fn(), run: jest.fn() };
    const scheduler = new ServiceProvisionDocScheduler(service as never, prisma as never);

    await scheduler.createCurrentMonth();
    await scheduler.recalculateCurrentMonth();
    await scheduler.finalizeCurrentMonth();
    await scheduler.onApplicationBootstrap();

    expect(prisma.syncJobSetting.findUnique).toHaveBeenCalledWith({
      where: { jobId: 'service-provision-recovery' }, select: { enabled: true },
    });
    expect(prisma.syncJobSetting.findUnique).toHaveBeenCalledWith({
      where: { jobId: 'service-provision-preparation' }, select: { enabled: true },
    });
    expect(prisma.syncJobSetting.findUnique).toHaveBeenCalledWith({
      where: { jobId: 'service-provision-send' }, select: { enabled: true },
    });
    expect(prisma.syncLog.create).not.toHaveBeenCalled();
    expect(service.computeAndSave).not.toHaveBeenCalled();
    expect(service.retryUnsyncedMonth).not.toHaveBeenCalled();
    expect(service.run).not.toHaveBeenCalled();
  });

  it('keeps automatic jobs enabled by default when no setting exists', async () => {
    const prisma = {
      syncJobSetting: { findUnique: jest.fn().mockResolvedValue(null) },
      syncLog: {
        create: jest.fn().mockResolvedValue({ id: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const push = { pushPayments: jest.fn().mockResolvedValue({ sent: 0, succeeded: 0, failed: 0 }) };
    const provider = { isConfigured: jest.fn().mockReturnValue(true) };

    await new Accounting1cPushScheduler(push as never, prisma as never, provider as never).pushPayments();

    expect(push.pushPayments).toHaveBeenCalledTimes(1);
    expect(prisma.syncLog.create).toHaveBeenCalledTimes(1);
  });
});
