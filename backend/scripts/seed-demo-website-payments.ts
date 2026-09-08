// Одноразовый seed для презентации флоу 1 (отправка WEBSITE-платежей в 1С Бухгалтерию,
// см. промпт проекта) на странице /payment-imports — реальных боевых реквизитов 1С нет,
// поэтому три Payment(source=WEBSITE) заводятся напрямую, с уже проставленным
// accounting1cSyncStatus (как будто ночной крон уже отработал), без PaymentAllocation —
// тот же приём и по той же причине, что в backfill-demo-payment-ledger.ts (период найма
// по демо-договору начинается только с 2026-09-01, привязывать искусственные суммы
// физически не к чему). Идемпотентно по externalRef (DEMO-WEBSITE-PAYMENT-*).
//
// Запуск (из backend/, после `npm run build`): node dist/scripts/seed-demo-website-payments.js [--force]

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '../generated/prisma/client.js';

const { Decimal } = Prisma;

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d;
}

async function main() {
  const force = process.argv.includes('--force');
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const contract = await prisma.contract.findFirst({ where: { number: 'VIP27-27/01' } });
  if (!contract) throw new Error('Договор VIP27-27/01 не найден — см. backfill-demo-payment-ledger.ts');

  const demoPayments = [
    {
      externalRef: 'DEMO-WEBSITE-PAYMENT-1',
      amount: 14500,
      paidAt: daysAgo(3),
      accounting1cSyncStatus: 'SYNCED' as const,
      accounting1cDocumentUid: '228be951-a47c-11f1-816c-ac162db8be48',
      accounting1cSyncError: null,
      accounting1cSyncedAt: daysAgo(2),
    },
    {
      externalRef: 'DEMO-WEBSITE-PAYMENT-2',
      amount: 13400,
      paidAt: daysAgo(1),
      accounting1cSyncStatus: 'FAILED' as const,
      accounting1cDocumentUid: null,
      accounting1cSyncError: 'Демо-ошибка: не найден объект договора на стороне 1С',
      accounting1cSyncedAt: daysAgo(1),
    },
    {
      externalRef: 'DEMO-WEBSITE-PAYMENT-3',
      amount: 15500,
      paidAt: new Date(),
      accounting1cSyncStatus: 'NOT_SYNCED' as const,
      accounting1cDocumentUid: null,
      accounting1cSyncError: null,
      accounting1cSyncedAt: null,
    },
  ];

  for (const demo of demoPayments) {
    const existing = await prisma.payment.findFirst({ where: { source: 'WEBSITE', externalRef: demo.externalRef } });
    if (existing) {
      if (!force) {
        console.log(`${demo.externalRef} уже есть — пропускаю (--force для пересоздания)`);
        continue;
      }
      await prisma.payment.delete({ where: { id: existing.id } });
    }

    const payment = await prisma.payment.create({
      data: {
        contractId: contract.id,
        amount: new Decimal(demo.amount),
        paidAt: demo.paidAt,
        method: 'CARD_ACQUIRING',
        source: 'WEBSITE',
        externalRef: demo.externalRef,
        accounting1cSyncStatus: demo.accounting1cSyncStatus,
        accounting1cDocumentUid: demo.accounting1cDocumentUid,
        accounting1cSyncError: demo.accounting1cSyncError,
        accounting1cSyncedAt: demo.accounting1cSyncedAt,
      },
    });
    console.log(`Создано: ${demo.externalRef} (${demo.amount} ₽, id=${payment.id}), статус 1С: ${demo.accounting1cSyncStatus}`);
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
