// Одноразовый seed для презентации флоу 3 ("оказание услуг", /finance/service-docs) —
// реальных боевых реквизитов 1С Бухгалтерии нет (см. промпт проекта, ACCOUNTING_1C_* не
// заполнены), поэтому реальный подсчёт (ServiceProvisionDocService#computeAndSave, дёргается
// на каждый GET) сейчас всегда находит ноль договоров — ни у одного нет уже известной пары
// ContractorUID/ContractUID (та появляется только после первого успешного флоу 1). Документы
// ("Найм"/"Коммуналка" за три последних месяца) заводятся напрямую, с уже проставленным
// accounting1cSyncStatus — как будто реальные прогоны уже были, три разных статуса
// (NOT_SYNCED/SYNCED/FAILED) на разных месяцах, тот же принцип, что в
// seed-demo-website-payments.ts. Идемпотентно по periodStart+type (тот же уникальный
// индекс, что использует сам ServiceProvisionDocService#run).
//
// Первая строка КАЖДОГО документа ссылается на реальный демо-договор VIP27-27/01 (тот же,
// что уже используют seed-demo-payment-imports.ts/seed-demo-website-payments.ts/
// backfill-demo-payment-ledger.ts) — если у него ещё нет accounting1cUid/
// Individual.accounting1cContractorUid, скрипт проставляет демо-значения (как будто флоу 1
// для него уже когда-то отработал), чтобы "Список договоров" в детализации документа
// показывал настоящее ФИО/номер, а не голый UID. Остальные строки — намеренно
// НЕ резолвящиеся demo-*-uid-N (показывают, как выглядит "Договор не опознан" в
// детализации) — специально НЕ трогаем другие реальные договоры чужими demo-UID'ами,
// чтобы не подложить мину под будущую настоящую интеграцию с 1С.
//
// Запуск (из backend/, после `npm run build`): node dist/scripts/seed-demo-service-provision-docs.js [--force]

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma, ServiceProvisionType } from '../generated/prisma/client.js';

const { Decimal } = Prisma;

const DEMO_CONTRACTOR_UID = 'demo-contractor-uid-vip27';
const DEMO_CONTRACT_UID = 'demo-contract-uid-vip27';

function startOfMonthsAgo(monthsAgo: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1, 0, 0, 0));
}
function isoDateOnly(d: Date): string {
  return `${d.toISOString().slice(0, 10)}T00:00:00`;
}
function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(9, 0, 0, 0);
  return d;
}

interface DemoDoc {
  periodStart: Date;
  type: ServiceProvisionType;
  nomenclature: 'Найм' | 'Коммуналка';
  documentSumm: number;
  contractCount: number;
  accounting1cSyncStatus: 'NOT_SYNCED' | 'SYNCED' | 'FAILED';
  accounting1cDocumentUid: string | null;
  accounting1cSyncError: string | null;
  accounting1cSyncedAt: Date | null;
}

async function main() {
  const force = process.argv.includes('--force');
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const contract = await prisma.contract.findFirst({
    where: { number: 'VIP27-27/01' },
    include: { resident: { select: { fizicheskoyeLitsoUid: true, fullName: true, accounting1cContractorUid: true } } },
  });
  if (!contract) throw new Error('Договор VIP27-27/01 не найден — см. backfill-demo-payment-ledger.ts');

  if (!contract.accounting1cUid) {
    await prisma.contract.update({ where: { id: contract.id }, data: { accounting1cUid: DEMO_CONTRACT_UID } });
    console.log(`Договору №${contract.number} проставлен демо-ContractUID (был пуст)`);
  }
  if (!contract.resident.accounting1cContractorUid) {
    await prisma.individual.update({
      where: { fizicheskoyeLitsoUid: contract.resident.fizicheskoyeLitsoUid },
      data: { accounting1cContractorUid: DEMO_CONTRACTOR_UID },
    });
    console.log(`Резиденту ${contract.resident.fullName} проставлен демо-ContractorUID (был пуст)`);
  }
  const realContractorUid = contract.resident.accounting1cContractorUid ?? DEMO_CONTRACTOR_UID;
  const realContractUid = contract.accounting1cUid ?? DEMO_CONTRACT_UID;

  const lastMonth = startOfMonthsAgo(1);
  const prevMonth = startOfMonthsAgo(2);
  const olderMonth = startOfMonthsAgo(3);

  // Три месяца подряд, чтобы на странице сразу были видны все три статуса отправки —
  // самый свежий месяц ещё не отправлялся (как оно и будет по-настоящему сразу после
  // включения интеграции и первого ночного прогона), средний ушёл успешно, а в самом
  // старом "Найм" специально с ошибкой — показать, как выглядит FAILED в таблице.
  const demoDocs: DemoDoc[] = [
    {
      periodStart: lastMonth,
      type: 'RENT',
      nomenclature: 'Найм',
      documentSumm: 43500,
      contractCount: 3,
      accounting1cSyncStatus: 'NOT_SYNCED',
      accounting1cDocumentUid: null,
      accounting1cSyncError: null,
      accounting1cSyncedAt: null,
    },
    {
      periodStart: lastMonth,
      type: 'UTILITIES',
      nomenclature: 'Коммуналка',
      documentSumm: 9200,
      contractCount: 3,
      accounting1cSyncStatus: 'NOT_SYNCED',
      accounting1cDocumentUid: null,
      accounting1cSyncError: null,
      accounting1cSyncedAt: null,
    },
    {
      periodStart: prevMonth,
      type: 'RENT',
      nomenclature: 'Найм',
      documentSumm: 41000,
      contractCount: 3,
      accounting1cSyncStatus: 'SYNCED',
      accounting1cDocumentUid: '3fa1c2e0-a47c-11f1-816c-ac162db8be48',
      accounting1cSyncError: null,
      accounting1cSyncedAt: daysAgo(28),
    },
    {
      periodStart: prevMonth,
      type: 'UTILITIES',
      nomenclature: 'Коммуналка',
      documentSumm: 8700,
      contractCount: 3,
      accounting1cSyncStatus: 'SYNCED',
      accounting1cDocumentUid: '5b2d9a10-a47c-11f1-816c-ac162db8be48',
      accounting1cSyncError: null,
      accounting1cSyncedAt: daysAgo(28),
    },
    {
      periodStart: olderMonth,
      type: 'RENT',
      nomenclature: 'Найм',
      documentSumm: 39500,
      contractCount: 3,
      accounting1cSyncStatus: 'FAILED',
      accounting1cDocumentUid: null,
      accounting1cSyncError: 'Демо-ошибка: не найден контрагент по ContractorUID',
      accounting1cSyncedAt: daysAgo(58),
    },
    {
      periodStart: olderMonth,
      type: 'UTILITIES',
      nomenclature: 'Коммуналка',
      documentSumm: 8100,
      contractCount: 3,
      accounting1cSyncStatus: 'SYNCED',
      accounting1cDocumentUid: '7c4e1f30-a47c-11f1-816c-ac162db8be48',
      accounting1cSyncError: null,
      accounting1cSyncedAt: daysAgo(58),
    },
  ];

  for (const demo of demoDocs) {
    const existing = await prisma.serviceProvisionDocument.findUnique({
      where: { periodStart_type: { periodStart: demo.periodStart, type: demo.type } },
    });
    if (existing) {
      if (!force) {
        console.log(`${demo.periodStart.toISOString().slice(0, 7)} / ${demo.type} уже есть — пропускаю (--force для пересоздания)`);
        continue;
      }
      await prisma.serviceProvisionDocument.delete({ where: { id: existing.id } });
    }

    const rawPayload = {
      Date: isoDateOnly(demo.periodStart),
      NomenclatureType: demo.nomenclature,
      DocumentSumm: demo.documentSumm,
      Comment: `HostelRosNOUWeb | ${demo.nomenclature === 'Найм' ? 'Найм услуги' : 'Коммунальные услуги'} | демо-данные`,
      // Первая строка — реальный демо-договор (см. backfill выше, резолвится в детализации
      // до настоящего ФИО/номера), остальные — намеренно нерезолвящиеся demo-*-uid-N
      // (показывают "Договор не опознан" в детализации).
      DocumentSummDetails: Array.from({ length: demo.contractCount }, (_, i) => ({
        ContractorUID: i === 0 ? realContractorUid : `demo-contractor-uid-${i + 1}`,
        ContractUID: i === 0 ? realContractUid : `demo-contract-uid-${i + 1}`,
        SummDetails: Math.round(demo.documentSumm / demo.contractCount),
      })),
    };

    const doc = await prisma.serviceProvisionDocument.create({
      data: {
        periodStart: demo.periodStart,
        type: demo.type,
        documentSumm: new Decimal(demo.documentSumm),
        contractCount: demo.contractCount,
        accounting1cSyncStatus: demo.accounting1cSyncStatus,
        accounting1cDocumentUid: demo.accounting1cDocumentUid,
        accounting1cSyncError: demo.accounting1cSyncError,
        accounting1cSyncedAt: demo.accounting1cSyncedAt,
        rawPayload,
      },
    });
    console.log(`Создано: ${demo.periodStart.toISOString().slice(0, 7)} / ${demo.type} (${demo.documentSumm} ₽, id=${doc.id}), статус 1С: ${demo.accounting1cSyncStatus}`);
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
