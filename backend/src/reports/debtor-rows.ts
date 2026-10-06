import { Prisma, ContractStatus } from '../../generated/prisma/client.js';
import { Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { roomAssignmentAtDate } from './room-assignment-at-date';
import { addDays, dateOnly } from '../billing/period-utils';
import { contractRegistryStatusAtDate } from './contract-registry-status';

const { Decimal } = Prisma;
const logger = new Logger('DebtorRows');

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
  // Для прошлой даты статус определяется по сроку и долгу на эту дату.
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

// Показывает все существовавшие на выбранную дату договоры (не только должников), на дату
// asOf (по умолчанию сегодня): "Долг" — тело долга только по уже НАСТУПИВШИМ начислениям
// (dueDate<=asOf), погашённое только платежами ДО asOf (позже — не считается, иначе
// "долг на дату X" включал бы деньги, внесённые уже после X), плюс пеня на asOf (сумма
// журнала PenaltyAccrualLog по эту дату, см. penalty-balance.ts). Начислено/Оплачено —
// по ВСЕМУ сроку договора целиком (не зависят от asOf) — справочные итоги.
// Вынесено из ReportsController (Финансовый отчёт) — та же выборка нужна фильтрам
// рассылки чата (текущая комната + баланс проживающего), см. chats/chat-recipients.ts.
export async function buildDebtorRows(prisma: PrismaService, asOf: Date, contractIds?: number[]): Promise<DebtorRow[]> {
  const startedAt = Date.now();
  if (contractIds?.length === 0) return [];
  const contracts = await prisma.contract.findMany({
    where: {
      ...(contractIds ? { id: { in: contractIds } } : {}),
      createdAt: { lt: addDays(asOf, 1) },
    },
    include: {
      resident: { select: { fullName: true, fizicheskoyeLitsoUid: true } },
      roomAssignments: { ...roomAssignmentAtDate(asOf), include: { room: { select: { id: true, room: true } } } },
      accruals: {
        where: { voidedAt: null },
        include: { allocations: { include: { payment: { select: { paidAt: true, reversedAt: true } } } }, refunds: true },
      },
      refunds: { select: { amount: true, creditAmount: true, refundedAt: true } },
    },
  });
  if (contracts.length === 0) return [];

  const ids = contracts.map((contract) => contract.id);
  // PostgreSQL sums the high-volume daily journal instead of transferring years
  // of penalty rows to the application for every report or broadcast preview.
  const [penaltyTotals, paymentTotals, paidPenaltyTotals, paymentAsOfTotals] = await Promise.all([
    prisma.penaltyAccrualLog.groupBy({
      by: ['contractId'], where: { contractId: { in: ids }, date: { lte: asOf } },
      _sum: { amount: true },
    }),
    prisma.payment.groupBy({
      by: ['contractId'], where: { contractId: { in: ids }, reversedAt: null },
      _sum: { amount: true },
    }),
    prisma.payment.groupBy({
      by: ['contractId'], where: { contractId: { in: ids }, reversedAt: null, paidAt: { lte: asOf } },
      _sum: { penaltyAmount: true },
    }),
    prisma.payment.groupBy({
      by: ['contractId'], where: { contractId: { in: ids }, reversedAt: null, paidAt: { lte: asOf } },
      _sum: { amount: true },
    }),
  ]);
  const penaltyByContract = new Map(penaltyTotals.map((row) => [row.contractId, row._sum.amount ?? new Decimal(0)]));
  const paidByContract = new Map(paymentTotals.map((row) => [row.contractId, row._sum.amount ?? new Decimal(0)]));
  const paidPenaltyByContract = new Map(paidPenaltyTotals.map((row) => [row.contractId, row._sum.penaltyAmount ?? new Decimal(0)]));
  const paidAsOfByContract = new Map(paymentAsOfTotals.map((row) => [row.contractId, row._sum.amount ?? new Decimal(0)]));

  const rows: DebtorRow[] = [];
  for (const contract of contracts) {
    let totalAccrued = new Decimal(0);
    let principalDebtAsOf = new Decimal(0);
    let allocatedAsOf = new Decimal(0);
    const totalRefunded = contract.refunds.reduce((sum, refund) => sum.plus(refund.amount), new Decimal(0));

    for (const accrual of contract.accruals) {
      const principal = accrual.rentAmount.plus(accrual.utilitiesAmount).plus(accrual.adjustmentAmount);
      totalAccrued = totalAccrued.plus(principal);
      allocatedAsOf = allocatedAsOf.plus(accrual.allocations
        .filter((allocation) => !allocation.payment.reversedAt && allocation.payment.paidAt <= asOf)
        .reduce((sum, allocation) => sum.plus(allocation.amount), new Decimal(0)));
      if (accrual.dueDate > asOf) continue;

      const paidAsOf = accrual.allocations
        .filter((al) => !al.payment.reversedAt && al.payment.paidAt <= asOf)
        .reduce((sum, al) => sum.plus(al.amount), new Decimal(0))
        .minus(accrual.refunds.filter((refund) => refund.refundedAt <= asOf)
          .reduce((sum, refund) => sum.plus(refund.amount.minus(refund.creditAmount)), new Decimal(0)));
      // НЕ ограничиваем снизу нулём — переплата по одному начислению должна гасить долг
      // по другому в сумме по договору (не просто исчезать), это и даёт отрицательный
      // "Долг" = переплата (см. DebtBalanceCell.vue на фронте, зелёная подсветка).
      principalDebtAsOf = principalDebtAsOf.plus(principal.minus(paidAsOf));
    }

    const penaltyBalance = (penaltyByContract.get(contract.id) ?? new Decimal(0))
      .minus(paidPenaltyByContract.get(contract.id) ?? new Decimal(0));
    const returnedCreditAsOf = contract.refunds.filter((refund) => refund.refundedAt <= asOf)
      .reduce((sum, refund) => sum.plus(refund.creditAmount), new Decimal(0));
    const unallocatedCreditAsOf = (paidAsOfByContract.get(contract.id) ?? new Decimal(0))
      .minus(allocatedAsOf)
      .minus(paidPenaltyByContract.get(contract.id) ?? new Decimal(0))
      .minus(returnedCreditAsOf);
    if (unallocatedCreditAsOf.greaterThan(0)) principalDebtAsOf = principalDebtAsOf.minus(unallocatedCreditAsOf);
    const totalPaid = (paidByContract.get(contract.id) ?? new Decimal(0)).minus(totalRefunded);

    const totalBalance = Number(principalDebtAsOf.plus(penaltyBalance));
    rows.push({
      contractId: contract.id,
      contractNumber: contract.number,
      residentIndividualUid: contract.residentIndividualUid,
      residentFullName: contract.resident.fullName,
      room: contract.roomAssignments[0]?.room.room ?? null,
      roomId: contract.roomAssignments[0]?.room.id ?? null,
      status: asOf < dateOnly(new Date())
        ? contractRegistryStatusAtDate(contract, asOf, totalBalance)
        : contract.status,
      createdAt: contract.createdAt,
      endDate: contract.endDate,
      totalAccrued: Number(totalAccrued),
      totalPaid: Number(totalPaid),
      principalDebt: Number(principalDebtAsOf),
      penaltyBalance: Number(penaltyBalance),
      totalBalance,
    });
  }

  const elapsedMs = Date.now() - startedAt;
  if (elapsedMs >= 500) logger.log(`Финансовый отчёт: договоров ${rows.length}, длительность ${elapsedMs} мс`);
  return rows;
}
