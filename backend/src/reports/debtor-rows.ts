import { Prisma, ContractStatus } from '../../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service';
import { computePenaltyBalance } from '../billing/penalty-balance';

const { Decimal } = Prisma;

export interface DebtorRow {
  contractId: number;
  contractNumber: string;
  residentIndividualUid: string;
  residentFullName: string;
  room: string | null;
  // Добавлено вместе с roomId — джойн с характеристиками комнаты (этаж/корпус) для
  // фильтров рассылки чата (см. chats/chat-recipients.ts), сам отчёт "Финансовый" его
  // не использует.
  roomId: number | null;
  status: ContractStatus;
  createdAt: Date;
  // endDate — только для отображения статуса "Истекает" на фронте (ContractStatusCell.vue,
  // тот же приём, что в основном списке /contracts), в расчёт долга/пени само по себе не участвует.
  endDate: Date;
  // Начислено/Оплачено — по ВСЕМУ сроку договора (весь срок целиком, не зависит от asOf) —
  // справочные итоги, не то же самое, что "Долг" ниже.
  totalAccrued: number;
  totalPaid: number;
  // Долг НА ДАТУ asOf: тело долга только по уже НАСТУПИВШИМ начислениям (dueDate<=asOf),
  // погашённое только теми платежами, что были ДО asOf, плюс пеня на asOf (сумма журнала
  // PenaltyAccrualLog по эту дату, см. penalty-balance.ts). Именно эта пара figures даёт
  // "долг по договору на дату", а не по всему сроку.
  principalDebt: number;
  penaltyBalance: number;
  totalBalance: number;
}

// Показывает ВСЕ договоры (по прямой просьбе 2026-08-22, не только должников), на дату
// asOf (по умолчанию сегодня): "Долг" — тело долга только по уже НАСТУПИВШИМ начислениям
// (dueDate<=asOf), погашённое только платежами ДО asOf (позже — не считается, иначе
// "долг на дату X" включал бы деньги, внесённые уже после X), плюс пеня на asOf (сумма
// журнала PenaltyAccrualLog по эту дату, см. penalty-balance.ts). Начислено/Оплачено —
// по ВСЕМУ сроку договора целиком (не зависят от asOf) — справочные итоги.
// Вынесено из ReportsController (Финансовый отчёт) — та же выборка нужна фильтрам
// рассылки чата (текущая комната + баланс проживающего), см. chats/chat-recipients.ts.
export async function buildDebtorRows(prisma: PrismaService, asOf: Date): Promise<DebtorRow[]> {
  const contracts = await prisma.contract.findMany({
    include: {
      resident: { select: { fullName: true, fizicheskoyeLitsoUid: true } },
      roomAssignments: { where: { toDate: null }, include: { room: { select: { id: true, room: true } } } },
      accruals: {
        where: { voidedAt: null },
        include: { allocations: { include: { payment: { select: { paidAt: true, reversedAt: true } } } } },
      },
      payments: true,
      penaltyLogs: true,
    },
  });

  const rows: DebtorRow[] = [];
  for (const contract of contracts) {
    let totalAccrued = new Decimal(0);
    let principalDebtAsOf = new Decimal(0);

    for (const accrual of contract.accruals) {
      const principal = accrual.rentAmount.plus(accrual.utilitiesAmount).plus(accrual.adjustmentAmount);
      totalAccrued = totalAccrued.plus(principal);
      if (accrual.dueDate > asOf) continue;

      const paidAsOf = accrual.allocations
        .filter((al) => !al.payment.reversedAt && al.payment.paidAt <= asOf)
        .reduce((sum, al) => sum.plus(al.amount), new Decimal(0));
      // НЕ ограничиваем снизу нулём — переплата по одному начислению должна гасить долг
      // по другому в сумме по договору (не просто исчезать), это и даёт отрицательный
      // "Долг" = переплата (см. DebtBalanceCell.vue на фронте, зелёная подсветка).
      principalDebtAsOf = principalDebtAsOf.plus(principal.minus(paidAsOf));
    }

    const { penaltyBalance } = computePenaltyBalance({
      asOf,
      penaltyLogs: contract.penaltyLogs,
      payments: contract.payments,
    });
    const totalPaid = contract.payments.filter((p) => !p.reversedAt).reduce((sum, p) => sum.plus(p.amount), new Decimal(0));

    rows.push({
      contractId: contract.id,
      contractNumber: contract.number,
      residentIndividualUid: contract.residentIndividualUid,
      residentFullName: contract.resident.fullName,
      room: contract.roomAssignments[0]?.room.room ?? null,
      roomId: contract.roomAssignments[0]?.room.id ?? null,
      status: contract.status,
      createdAt: contract.createdAt,
      endDate: contract.endDate,
      totalAccrued: Number(totalAccrued),
      totalPaid: Number(totalPaid),
      principalDebt: Number(principalDebtAsOf),
      penaltyBalance: Number(penaltyBalance),
      totalBalance: Number(principalDebtAsOf.plus(penaltyBalance)),
    });
  }

  return rows;
}
