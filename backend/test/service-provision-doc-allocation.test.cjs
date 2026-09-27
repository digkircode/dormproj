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
  assert.equal(first.documentIds.length, 2);

  const rent = stored.get('RENT').rawPayload;
  const utilities = stored.get('UTILITIES').rawPayload;
  assert.equal(rent.DocumentSumm, 16300);
  assert.equal(utilities.DocumentSumm, 2200);
  assert.deepEqual(rent.DocumentSummDetails.map((row) => [row.ContractNumber, row.SummDetails]), [
    ['legacy-full', 11400], ['daily-partial', 2400], ['daily-small', 700], ['daily-equal', 1100], ['daily-only-room', 700],
  ]);
  assert.deepEqual(utilities.DocumentSummDetails.map((row) => [row.ContractNumber, row.SummDetails]), [
    ['legacy-full', 1100], ['daily-partial', 1100],
  ]);
  assert.equal(rent.DocumentSumm + utilities.DocumentSumm, 12500 + 3500 + 700 + 1100 + 700);

  const second = await service.computeAndSave(date('2026-09-01'));
  assert.deepEqual(second.documentIds, first.documentIds);
  assert.equal(stored.size, 2);

  stored.get('RENT').rawPayload.DocumentSummDetails[0].SummDetails = 12500;
  await service.computeAndSave(date('2026-09-01'));
  assert.equal(stored.get('RENT').accounting1cSyncStatus, 'NOT_SYNCED');
  assert.equal(stored.get('RENT').rawPayload.DocumentSummDetails[0].SummDetails, 11400);
});
