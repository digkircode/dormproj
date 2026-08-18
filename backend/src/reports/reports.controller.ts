import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { daysBetweenInclusive, dateOnly, addDays } from '../billing/period-utils';

const { Decimal } = Prisma;

type AgingBucket = 'CURRENT' | 'D1_30' | 'D31_60' | 'D61_90' | 'D90_PLUS';

function agingBucket(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return 'CURRENT';
  if (daysOverdue <= 30) return 'D1_30';
  if (daysOverdue <= 60) return 'D31_60';
  if (daysOverdue <= 90) return 'D61_90';
  return 'D90_PLUS';
}

@Controller('reports')
@UseGuards(AuthGuard)
export class ReportsController {
  constructor(private readonly prisma: PrismaService) {}

  // Должники на дату asOf (по умолчанию сегодня) — по каждому договору с непогашенным
  // остатком: основной долг отдельно от пени (платежи по начислению считаем сначала
  // гасящими тело долга, остаток сверху — пеню, тот же принцип, что в billing/penalty.scheduler.ts),
  // плюс aging-бакет по самому старому неоплаченному начислению.
  @Get('debtors')
  async debtors(@Query('asOf') asOfParam?: string) {
    const asOf = asOfParam ? dateOnly(new Date(asOfParam)) : dateOnly(new Date());

    const accruals = await this.prisma.accrual.findMany({
      where: { voidedAt: null, dueDate: { lte: asOf } },
      include: {
        allocations: true,
        contract: {
          include: {
            resident: { select: { fullName: true } },
            roomAssignments: { where: { toDate: null }, include: { room: { select: { room: true } } } },
          },
        },
      },
    });

    interface Row {
      contractId: number;
      contractNumber: string;
      residentFullName: string;
      room: string | null;
      principalBalance: Prisma.Decimal;
      penaltyBalance: Prisma.Decimal;
      maxDaysOverdue: number;
    }
    const byContract = new Map<number, Row>();

    for (const accrual of accruals) {
      const principal = accrual.rentAmount.plus(accrual.utilitiesAmount).plus(accrual.adjustmentAmount);
      const paid = accrual.allocations.reduce((sum, a) => sum.plus(a.amount), new Decimal(0));
      const unpaidPrincipal = principal.minus(paid).lessThan(0) ? new Decimal(0) : principal.minus(paid);
      const paidTowardPenalty = paid.minus(principal).lessThan(0) ? new Decimal(0) : paid.minus(principal);
      const unpaidPenalty = accrual.penaltyAmount.minus(paidTowardPenalty).lessThan(0)
        ? new Decimal(0)
        : accrual.penaltyAmount.minus(paidTowardPenalty);

      if (unpaidPrincipal.lessThanOrEqualTo(0) && unpaidPenalty.lessThanOrEqualTo(0)) continue;

      const daysOverdue = Math.max(0, daysBetweenInclusive(accrual.dueDate, asOf) - 1);
      const { contract } = accrual;

      const existing = byContract.get(contract.id);
      if (existing) {
        existing.principalBalance = existing.principalBalance.plus(unpaidPrincipal);
        existing.penaltyBalance = existing.penaltyBalance.plus(unpaidPenalty);
        existing.maxDaysOverdue = Math.max(existing.maxDaysOverdue, daysOverdue);
      } else {
        byContract.set(contract.id, {
          contractId: contract.id,
          contractNumber: contract.number,
          residentFullName: contract.resident.fullName,
          room: contract.roomAssignments[0]?.room.room ?? null,
          principalBalance: unpaidPrincipal,
          penaltyBalance: unpaidPenalty,
          maxDaysOverdue: daysOverdue,
        });
      }
    }

    return Array.from(byContract.values())
      .map((row) => ({
        contractId: row.contractId,
        contractNumber: row.contractNumber,
        residentFullName: row.residentFullName,
        room: row.room,
        principalBalance: Number(row.principalBalance),
        penaltyBalance: Number(row.penaltyBalance),
        totalBalance: Number(row.principalBalance.plus(row.penaltyBalance)),
        daysOverdue: row.maxDaysOverdue,
        agingBucket: agingBucket(row.maxDaysOverdue),
      }))
      .sort((a, b) => b.totalBalance - a.totalBalance);
  }

  // Кто проживает на дату asOf (по умолчанию сегодня) — через RoomAssignment, не через
  // "текущую" комнату у договора (переезды учитываются, см. дизайн-документ §3.2).
  @Get('current-residents')
  async currentResidents(@Query('asOf') asOfParam?: string) {
    const asOf = asOfParam ? dateOnly(new Date(asOfParam)) : dateOnly(new Date());

    const assignments = await this.prisma.roomAssignment.findMany({
      where: { fromDate: { lte: asOf }, OR: [{ toDate: null }, { toDate: { gte: asOf } }] },
      include: {
        room: { select: { room: true } },
        contract: { select: { id: true, number: true, status: true, resident: { select: { fullName: true } } } },
      },
      orderBy: { fromDate: 'asc' },
    });

    return assignments.map((a) => ({
      contractId: a.contract.id,
      contractNumber: a.contract.number,
      contractStatus: a.contract.status,
      residentFullName: a.contract.resident.fullName,
      room: a.room.room,
      fromDate: a.fromDate,
    }));
  }

  // Начисления со сроком оплаты в ближайшие N дней (по умолчанию 7), ещё не закрытые —
  // для точечных напоминаний.
  @Get('upcoming-payments')
  async upcomingPayments(@Query('days') daysParam?: string) {
    const days = Math.max(1, Number.parseInt(daysParam ?? '', 10) || 7);
    const today = dateOnly(new Date());
    const until = addDays(today, days);

    const accruals = await this.prisma.accrual.findMany({
      where: { voidedAt: null, dueDate: { gte: today, lte: until } },
      include: {
        allocations: true,
        contract: { select: { id: true, number: true, resident: { select: { fullName: true } } } },
      },
      orderBy: { dueDate: 'asc' },
    });

    return accruals
      .map((accrual) => {
        const total = accrual.rentAmount.plus(accrual.utilitiesAmount).plus(accrual.penaltyAmount).plus(accrual.adjustmentAmount);
        const paid = accrual.allocations.reduce((sum, a) => sum.plus(a.amount), new Decimal(0));
        return {
          contractId: accrual.contract.id,
          contractNumber: accrual.contract.number,
          residentFullName: accrual.contract.resident.fullName,
          dueDate: accrual.dueDate,
          balance: Number(total.minus(paid)),
        };
      })
      .filter((row) => row.balance > 0);
  }
}
