
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

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
