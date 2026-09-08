// Демонстрационные документы в формате AllPaymentDoc (примеры Desktop/buh).
// Запуск: node dist/scripts/seed-demo-payment-imports.js
// Обновляет только DEMO-PAYMENT-IMPORT-*, сохраняя подтверждения и сторнирования.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { randomUUID } from 'node:crypto';

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const contract = await prisma.contract.findFirst({
      where: {
        number: 'VIP27-27/01',
        accounting1cUid: { not: null },
        resident: { accounting1cContractorUid: { not: null } },
      },
      include: { resident: true },
    });
    if (!contract) throw new Error('Демо-договор VIP27-27/01 должен иметь реальную пару UID 1С');
    const samples = [
      { type: 'Операция по платежной карте', amount: '7\u00a0000' },
      { type: 'Поступление наличных', amount: '1\u00a0100' },
      { type: 'Операция по платежной карте', amount: '14\u00a0500' },
      { type: 'Поступление наличных', amount: '7\u00a0000' },
      { type: 'Операция по платежной карте', amount: '15\u00a0500' },
      { type: 'Поступление наличных', amount: '3\u00a0500' },
    ];
    for (const [index, sample] of samples.entries()) {
      const externalId = `DEMO-PAYMENT-IMPORT-${index + 1}`;
      const existing = await prisma.paymentImportRecord.findFirst({ where: { source: '1C', externalId } });
      // Не меняем реквизиты уже проведённого платежа: это финансовая история.
      if (existing?.resultingPaymentId) {
        console.log(`${externalId}: проведённый документ сохранён`);
        continue;
      }
      const period = new Date();
      period.setUTCDate(period.getUTCDate() - index - 1);
      period.setUTCHours(10, 0, 0, 0);
      const previous = existing?.rawPayload as Record<string, unknown> | undefined;
      const rawPayload = {
        Period: period.toISOString().slice(0, 19),
        DocumentName: `${sample.type} DEMO-${index + 1} от ${period.toLocaleDateString('ru-RU')}`,
        DocumentUID: typeof previous?.DocumentUID === 'string' ? previous.DocumentUID : randomUUID(),
        Type: sample.type,
        Contractor: contract.resident.fullName,
        ContractorUID: contract.resident.accounting1cContractorUid!,
        Contract: contract.number,
        ContractUID: contract.accounting1cUid!,
        DocumentSumm: sample.amount,
        Osnovanie: 'Демонстрационная оплата за общежитие',
      };
      if (existing) {
        await prisma.paymentImportRecord.update({ where: { id: existing.id }, data: { rawPayload, suggestedContractId: contract.id } });
      } else {
        await prisma.paymentImportRecord.create({ data: { source: '1C', externalId, rawPayload, status: 'NEEDS_REVIEW', suggestedContractId: contract.id } });
      }
      console.log(`${externalId}: ${sample.type}, ${sample.amount}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
