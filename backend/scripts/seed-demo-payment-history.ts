// Одноразовый seed для презентации функционала "Онлайн-оплата" — заполняет "Историю
// оплат" (/student/payment) правдоподобными записями PaymentIntent для конкретного
// демо-аккаунта (users.id=818), т.к. в проекте нет ни живой оплаты (эквайринг без
// реквизитов), ни импорта платежей из 1С. Идемпотентно: если у договора уже есть
// PaymentIntent — ничего не делает, если не передан --force (тогда пересоздаёт).
// Не для повторного использования — конкретный демо-аккаунт и сценарий зашиты внутри.
//
// Запуск (из backend/): npx ts-node -r tsconfig-paths/register scripts/seed-demo-payment-history.ts [--force]

// Голый ts-node не умеет резолвить nodenext-стиль импортов Prisma-клиента (.js-specifier
// на самом деле .ts-файл) рекурсивно по всему дереву — поэтому запускать этот скрипт
// нужно СКОМПИЛИРОВАННЫМ: `npm run build`, затем `node dist/scripts/seed-demo-payment-history.js`.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '../generated/prisma/client.js';
import { buildPaymentDescription, buildPeriodLabel } from '../src/my-payments/payment-description';

const DEMO_USER_ID = 818;
const { Decimal } = Prisma;

function monthsAgo(n: number, day = 12): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - n, day);
  d.setHours(10, 0, 0, 0);
  return d;
}

async function main() {
  const force = process.argv.includes('--force');
  const dryRun = process.argv.includes('--dry-run');
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const user = await prisma.user.findUnique({ where: { id: DEMO_USER_ID }, select: { univerId: true } });
  if (!user?.univerId) {
    throw new Error(`users.id=${DEMO_USER_ID} не найден или не привязан к физлицу (univerId пуст)`);
  }

  const contract = await prisma.contract.findFirst({
    where: { residentIndividualUid: user.univerId },
    orderBy: { contractDate: 'desc' },
    include: {
      resident: { select: { fullName: true } },
      terms: { orderBy: { validFrom: 'desc' }, take: 1 },
    },
  });
  if (!contract) {
    throw new Error(`У физлица ${user.univerId} (users.id=${DEMO_USER_ID}) нет ни одного договора — заводить историю оплат некуда`);
  }

  const existing = await prisma.paymentIntent.count({ where: { contractId: contract.id } });
  if (existing > 0 && !force) {
    console.log(`У договора № ${contract.number} уже есть ${existing} запись(ей) в истории оплат — пропускаю (передайте --force для пересоздания)`);
    await prisma.$disconnect();
    return;
  }
  if (existing > 0 && force) {
    await prisma.paymentIntent.deleteMany({ where: { contractId: contract.id } });
    console.log(`Удалено ${existing} старых демо-записей истории оплат`);
  }

  const terms = contract.terms[0];
  const monthlyAmount = terms ? Number(terms.rentAmount) + Number(terms.utilitiesAmount) : 0;
  // Полностью посуточный договор (см. DormProjPrompt.md "Полностью посуточные договоры") —
  // rentAmount/utilitiesAmount всегда 0, месячной суммы не существует — берём условную
  // сумму от суточной ставки только для правдоподобия демо-цифр.
  const fallbackAmount = terms ? Number(terms.dailyRateAmount) * 30 : 5000;
  const baseAmount = monthlyAmount > 0 ? monthlyAmount : fallbackAmount;

  const residentFullName = contract.resident.fullName;

  const rows: Prisma.PaymentIntentCreateManyInput[] = [
    {
      contractId: contract.id,
      amount: new Decimal(baseAmount),
      status: 'SUCCEEDED',
      description: buildPaymentDescription(residentFullName, true, null, buildPeriodLabel([monthsAgo(3)], false)),
      payerFullName: residentFullName,
      createdAt: monthsAgo(3),
      updatedAt: monthsAgo(3),
    },
    {
      contractId: contract.id,
      amount: new Decimal(baseAmount),
      status: 'SUCCEEDED',
      description: buildPaymentDescription(residentFullName, true, null, buildPeriodLabel([monthsAgo(2)], false)),
      payerFullName: residentFullName,
      createdAt: monthsAgo(2),
      updatedAt: monthsAgo(2),
    },
    {
      contractId: contract.id,
      amount: new Decimal(baseAmount),
      status: 'SUCCEEDED',
      description: buildPaymentDescription(residentFullName, true, null, buildPeriodLabel([monthsAgo(1)], false)),
      payerFullName: residentFullName,
      createdAt: monthsAgo(1),
      updatedAt: monthsAgo(1),
    },
    // Пеня — отдельным платежом (бизнес-правило: не совмещается с оплатой начисления),
    // тот же принцип, что в my-payments.controller.ts#createIntent — includePenalty
    // допустим, только когда открытых начислений уже не осталось.
    {
      contractId: contract.id,
      amount: new Decimal(87.4),
      status: 'SUCCEEDED',
      description: buildPaymentDescription(residentFullName, true, null, buildPeriodLabel([], true)),
      payerFullName: residentFullName,
      createdAt: monthsAgo(1, 20),
      updatedAt: monthsAgo(1, 20),
    },
    {
      contractId: contract.id,
      amount: new Decimal(baseAmount),
      status: 'FAILED',
      description: buildPaymentDescription(residentFullName, true, null, buildPeriodLabel([monthsAgo(0)], false)),
      payerFullName: residentFullName,
      failureReason: 'Банк отклонил операцию — недостаточно средств на карте',
      createdAt: monthsAgo(0, 3),
      updatedAt: monthsAgo(0, 3),
    },
  ];

  if (dryRun) {
    console.log(`[dry-run] Договор № ${contract.number} (${residentFullName}), contractId=${contract.id}. Будет вставлено:`);
    console.table(
      rows.map((r) => ({
        amount: r.amount!.toString(),
        status: r.status,
        description: r.description,
        payerFullName: r.payerFullName,
        createdAt: (r.createdAt as Date).toLocaleDateString('ru-RU'),
        failureReason: r.failureReason ?? '',
      })),
    );
    await prisma.$disconnect();
    return;
  }

  await prisma.paymentIntent.createMany({ data: rows });
  console.log(`Добавлено ${rows.length} демо-записей истории оплат для договора № ${contract.number} (${residentFullName})`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
