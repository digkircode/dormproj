const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Prisma } = require('../dist/generated/prisma/client.js');
const { ServiceProvisionDocService } = require('../dist/src/billing/service-provision-doc.service.js');

const money = (value) => new Prisma.Decimal(value);
const date = (value) => new Date(`${value}T00:00:00.000Z`);

function contract(id, number, periodStart, periodEnd, accrual, terms) {
  return {
    id, number, residentIndividualUid: `resident-${id}`, accounting1cUid: null,
    resident: { fullName: `Resident ${id}`, accounting1cContractorUid: null },
    terms: [{ validFrom: date('2026-01-01'), validTo: null, rentAmount: money(terms.rent), utilitiesAmount: money(terms.utilities) }],
    accruals: [{ periodStart: date(periodStart), periodEnd: date(periodEnd),
      rentAmount: money(accrual.rent), utilitiesAmount: money(accrual.utilities), adjustmentAmount: money(0) }],
  };
}

test('service documents preserve period totals and allocate fixed utilities once', async () => {
  const contracts = [
    contract(1, 'legacy-full', '2026-09-01', '2026-09-30', { rent: 12500, utilities: 0 }, { rent: 12500, utilities: 0 }),
    contract(2, 'daily-partial', '2026-09-24', '2026-09-30', { rent: '3094.74', utilities: '405.26' }, { rent: 8000, utilities: 1100 }),
    contract(3, 'daily-small', '2026-09-29', '2026-09-30', { rent: 600, utilities: 100 }, { rent: 8000, utilities: 1100 }),
    contract(4, 'daily-equal', '2026-09-26', '2026-09-30', { rent: 900, utilities: 200 }, { rent: 8000, utilities: 1100 }),
    contract(5, 'daily-only-room', '2026-09-01', '2026-09-30', { rent: 700, utilities: 0 }, { rent: 0, utilities: 0 }),
  ];
  const stored = new Map();
  const prisma = {
    contract: { findMany: async () => contracts },
    penaltyAccrualLog: { findMany: async () => [] },
    dormitoryInfo: { findUnique: async () => ({ communalServicesCost: money(1100) }) },
    serviceProvisionDocument: {
      findUnique: async ({ where }) => stored.get(where.periodStart_type.type) ?? null,
      upsert: async ({ where, create, update }) => {
        const type = where.periodStart_type.type;
        const existing = stored.get(type);
        const row = existing ? { ...existing, ...update } : { id: stored.size + 1, ...create };
        stored.set(type, row);
        return row;
      },
    },
  };
  const service = new ServiceProvisionDocService(prisma, {});
  const first = await service.computeAndSave(date('2026-09-01'));
  assert.equal(first.documentIds.length, 3);

  const rent = stored.get('RENT').rawPayload;
  const utilities = stored.get('UTILITIES').rawPayload;
  const penalties = stored.get('PENALTY').rawPayload;
  assert.equal(rent.DocumentSumm, 16300);
  assert.equal(utilities.DocumentSumm, 2200);
  assert.deepEqual(rent.DocumentSummDetails.map((row) => [row.ContractNumber, row.SummDetails]), [
    ['legacy-full', 11400], ['daily-partial', 2400], ['daily-small', 700], ['daily-equal', 1100], ['daily-only-room', 700],
  ]);
  assert.deepEqual(utilities.DocumentSummDetails.map((row) => [row.ContractNumber, row.SummDetails]), [
    ['legacy-full', 1100], ['daily-partial', 1100],
  ]);
  assert.equal(rent.DocumentSumm + utilities.DocumentSumm, 12500 + 3500 + 700 + 1100 + 700);
  assert.equal(penalties.DocumentSumm, 0);
  assert.deepEqual(penalties.DocumentSummDetails, []);

  const second = await service.computeAndSave(date('2026-09-01'));
  assert.deepEqual(second.documentIds, first.documentIds);
  assert.equal(stored.size, 3);

  stored.get('RENT').rawPayload.DocumentSummDetails[0].SummDetails = 12500;
  await service.computeAndSave(date('2026-09-01'));
  assert.equal(stored.get('RENT').accounting1cSyncStatus, 'NOT_SYNCED');
  assert.equal(stored.get('RENT').rawPayload.DocumentSummDetails[0].SummDetails, 11400);
});

test('penalty document groups actual daily charges by contract and month, including contracts without service charges', async () => {
  const logs = [
    { contractId: 1, date: date('2026-09-01'), amount: money('1.25') },
    { contractId: 1, date: date('2026-09-02'), amount: money('2.35') },
    { contractId: 2, date: date('2026-09-20'), amount: money('3.40') },
    { contractId: 1, date: date('2026-10-01'), amount: money('10.00') },
  ];
  const stored = new Map();
  let nextId = 1;
  const prisma = {
    penaltyAccrualLog: {
      findMany: async ({ where }) => logs
        .filter((log) => log.date >= where.date.gte && log.date < where.date.lt)
        .map((log) => ({ ...log, contract: {
          number: `penalty-${log.contractId}`,
          residentIndividualUid: `resident-${log.contractId}`,
          accounting1cUid: `contract-uid-${log.contractId}`,
          resident: { fullName: `Resident ${log.contractId}`, accounting1cContractorUid: `contractor-uid-${log.contractId}` },
        } })),
    },
    serviceProvisionDocument: {
      findUnique: async ({ where }) => stored.get(`${where.periodStart_type.periodStart.toISOString()}-${where.periodStart_type.type}`) ?? null,
      findMany: async ({ where }) => [...stored.values()]
        .filter((row) => where.id.in.includes(row.id))
        .map((row) => ({ id: row.id, rawPayload: row.rawPayload, accounting1cDocumentUid: null })),
      upsert: async ({ where, create, update }) => {
        const key = `${where.periodStart_type.periodStart.toISOString()}-${where.periodStart_type.type}`;
        const existing = stored.get(key);
        const row = existing ? { ...existing, ...update } : { id: nextId++, ...create };
        stored.set(key, row);
        return row;
      },
    },
  };
  const provider = { isServiceProvisionConfigured: () => true, pushServiceProvisionDocs: async () => { throw new Error('Penalty must not be sent'); } };
  const service = new ServiceProvisionDocService(prisma, provider);
  const september = await service.computeAndSave(date('2026-09-01'), ['PENALTY']);
  const document = stored.get(`${date('2026-09-01').toISOString()}-PENALTY`);
  assert.equal(document.rawPayload.NomenclatureType, 'Пени');
  assert.equal(document.rawPayload.DocumentSumm, 7);
  assert.deepEqual(document.rawPayload.DocumentSummDetails.map((row) => [row.ContractNumber, row.SummDetails]), [
    ['penalty-1', 3.6], ['penalty-2', 3.4],
  ]);
  assert.equal(document.contractCount, 2);
  assert.deepEqual((await service.computeAndSave(date('2026-09-01'), ['PENALTY'])).documentIds, september.documentIds);
  const october = await service.computeAndSave(date('2026-10-01'), ['PENALTY']);
  assert.notDeepEqual(october.documentIds, september.documentIds);
  assert.equal(stored.get(`${date('2026-10-01').toISOString()}-PENALTY`).rawPayload.DocumentSumm, 10);
  assert.equal((await service.sendDocuments(september.documentIds)).blocked, 1);
});
