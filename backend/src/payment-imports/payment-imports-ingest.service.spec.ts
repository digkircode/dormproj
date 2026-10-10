import { PaymentImportsIngestService } from './payment-imports-ingest.service';

describe('PaymentImportsIngestService', () => {
  it('imports a repeated DocumentUID once and remains safe to rerun', async () => {
    const raw = { DocumentUID: 'payment-1', ContractorUID: 'person-1', ContractUID: 'contract-1', DocumentSumm: 100 };
    const stored = new Set<string>();
    const create = jest.fn().mockImplementation(async ({ data }: { data: { externalId: string } }) => {
      if (stored.has(data.externalId)) throw new Error('Unique constraint failed');
      stored.add(data.externalId);
    });
    const prisma = {
      contract: {
        findMany: jest.fn().mockImplementation(async ({ select }: { select: { id?: boolean } }) =>
          select.id ? [{ id: 7 }] : [{ accounting1cUid: 'contract-1', resident: { accounting1cContractorUid: 'person-1' } }]),
      },
      paymentImportRecord: {
        findMany: jest.fn().mockImplementation(async () => [...stored].map((externalId) => ({ externalId }))),
        create,
      },
      payment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const provider = { isFetchConfigured: () => true, fetchPayments: jest.fn().mockResolvedValue([raw, { ...raw }]) };
    const service = new PaymentImportsIngestService(prisma as never, provider as never);

    await expect(service.ingest()).resolves.toEqual({ fetched: 2, imported: 1, skippedExisting: 1, knownPairs: 1 });
    await expect(service.ingest()).resolves.toEqual({ fetched: 2, imported: 0, skippedExisting: 2, knownPairs: 1 });
    expect(create).toHaveBeenCalledTimes(1);
    expect(stored).toEqual(new Set(['payment-1']));
  });
});
