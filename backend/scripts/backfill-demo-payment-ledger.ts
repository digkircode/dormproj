// Одноразовый фикс демо-данных: у моковых SUCCEEDED PaymentIntent (см.
// seed-demo-payment-history.ts) нет соответствующих леджерных Payment — их
// вкладка "Платежи" у резидента (MyContract.vue, после 2026-08-26) теперь не показывает
// намеренно (SUCCEEDED intent исключается, чтобы не дублировать настоящие онлайн-платежи —
// у тех Payment создаётся автоматически, см. reconcileBankStatus). Довставляет Payment и
// линкует через PaymentIntent.paymentId. Без PaymentAllocation — период найма по этому
// договору начинается только с 2026-09-01 (см. фактические accruals), у моковых описаний
// "за май/июнь/июль 2026" реального начисления под собой никогда не было (сам текст был
// придуман скриптом-сидером без сверки с настоящим периодом договора) — привязывать
// физически не к чему, записываем как есть, без разноски.
//
// Запуск (из backend/, после `npm run build`): node dist/scripts/backfill-demo-payment-ledger.js [--dry-run]

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  // По номеру, не "самый свежий у резидента" — у Цуйкова с 2026-08-25 появился второй,
  // более новый договор (№123321, id=41), findFirst orderBy contractDate desc уехал бы
  // на него и не нашёл бы там ничего (ровно на этом споткнулся первый прогон скрипта).
  const contract = await prisma.contract.findFirst({ where: { number: 'VIP27-27/01' } });
  if (!contract) throw new Error('Договор VIP27-27/01 не найден');

  const succeededIntents = await prisma.paymentIntent.findMany({
    where: { contractId: contract.id, status: 'SUCCEEDED', paymentId: null },
    orderBy: { createdAt: 'asc' },
  });
  if (succeededIntents.length === 0) {
    console.log('Нет SUCCEEDED PaymentIntent без Payment — нечего чинить.');
    await prisma.$disconnect();
    return;
  }

  console.log(`Договор № ${contract.number}. Будет создано ${succeededIntents.length} Payment:`);
  console.table(succeededIntents.map((intent) => ({ intentId: intent.id, amount: intent.amount.toString(), description: intent.description })));

  if (dryRun) {
    await prisma.$disconnect();
    return;
  }

  for (const intent of succeededIntents) {
    await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          contractId: contract.id,
          amount: intent.amount,
          paidAt: intent.createdAt,
          method: 'CARD_ACQUIRING',
          source: 'WEBSITE',
          rawComment: intent.description,
        },
      });
      await tx.paymentIntent.update({ where: { id: intent.id }, data: { paymentId: payment.id } });
    });
  }

  console.log(`Готово — создано ${succeededIntents.length} Payment, PaymentIntent привязаны через paymentId.`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
