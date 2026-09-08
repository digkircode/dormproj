import { describe, expect, it } from '@jest/globals';
import { parsePaymentImportCandidate, paymentMethodFromType } from './payment-import-candidate';
import { suggestContractMatch } from './suggest-contract-match';
import type { PrismaService } from '../prisma/prisma.service';

describe('AllPaymentDoc', () => {
  it('reads the real API field names and non-breaking thousands separator', () => {
    const row = parsePaymentImportCandidate({
      DocumentUID: 'document-uid', Period: '2023-08-08T16:00:00',
      ContractorUID: 'resident-uid', ContractUID: 'contract-uid',
      Contractor: 'Демо Проживающий', Contract: 'основной',
      DocumentSumm: '7\u00a0000', Type: 'Операция по платежной карте', Osnovanie: 'Оплата',
    });
    expect(row.amount).toBe(7000);
    expect(row.externalId).toBe('document-uid');
    expect(row.contractUid).toBe('contract-uid');
    expect(paymentMethodFromType(row.type)).toBe('CARD_ACQUIRING');
    expect(paymentMethodFromType('Поступление наличных')).toBe('CASH');
    expect(paymentMethodFromType('Неизвестный документ')).toBeNull();
  });

  it('uses both UIDs and never falls back to a name or latest contract', async () => {
    const candidate = parsePaymentImportCandidate({ ContractorUID: 'person', ContractUID: 'contract', Contractor: 'Name' });
    let calls = 0;
    const prisma = { contract: { findMany: async (query: unknown) => {
      calls++;
      expect(query).toMatchObject({ where: { accounting1cUid: 'contract', resident: { accounting1cContractorUid: 'person' } } });
      return [];
    } } } as unknown as PrismaService;
    expect(await suggestContractMatch(prisma, candidate)).toBeNull();
    expect(calls).toBe(1);
    expect(await suggestContractMatch(prisma, { ...candidate, contractUid: null })).toBeNull();
    expect(calls).toBe(1);
  });
});
