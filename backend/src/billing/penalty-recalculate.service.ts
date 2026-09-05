import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { PENALTY_DAILY_RATE } from './accrual-generation';
import { addDays, dateOnly, daysBetweenInclusive } from './period-utils';
import { buildAccrualPenaltyCalcs, earliestPenaltyStartsAt, overdueSumOnDay } from './penalty-calc';

const { Decimal } = Prisma;

// Ручной пересчёт пени по кнопке сотрудника (billing.controller.ts) — в отличие от ночного
// крона (penalty.scheduler.ts, только инкрементальный катч-ап с последнего запуска),
// перестраивает ВЕСЬ журнал пени договора с нуля тем же дневным расчётом (penalty-calc.ts).
// Нужен для договоров, у которых история пени могла оказаться неверной ещё ДО фикса
// 2026-09-05 (задним числом занесённый договор получал пеню от максимального долга сразу
// за весь пропущенный период вместо нарастания по дням) — обычный крон такую уже
// существующую в БД историю сам не поправит, он только идёт вперёд от penaltyAccruedThrough.
@Injectable()
export class PenaltyRecalculateService {
  constructor(private readonly prisma: PrismaService) {}

  async recalculate(contractId: number): Promise<{ rowsCreated: number; totalAdded: Prisma.Decimal }> {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        accruals: {
          where: { voidedAt: null },
          include: {
            allocations: { include: { payment: { select: { paidAt: true, reversedAt: true } } } },
          },
        },
      },
    });
    if (!contract) {
      throw new NotFoundException('contracts.errors.contractNotFound');
    }

    const today = dateOnly(new Date());
    const calcs = await buildAccrualPenaltyCalcs(this.prisma, contract, contract.accruals);
    const startsAt = earliestPenaltyStartsAt(calcs);

    const rows: { contractId: number; date: Date; amount: Prisma.Decimal; overdueBase: Prisma.Decimal }[] = [];
    let totalAdded = new Decimal(0);

    if (startsAt && startsAt <= today) {
      const days = daysBetweenInclusive(startsAt, today);
      for (let i = 0; i < days; i++) {
        const day = addDays(startsAt, i);
        const overdueSum = overdueSumOnDay(calcs, day, contract.matCapitalDeferredUntil);
        if (overdueSum.greaterThan(0)) {
          const amount = overdueSum.times(PENALTY_DAILY_RATE);
          rows.push({ contractId, date: day, amount, overdueBase: overdueSum });
          totalAdded = totalAdded.plus(amount);
        }
      }
    }

    // Полная пересборка — старый журнал договора удаляется целиком и заменяется заново
    // посчитанным, а не дополняется: старые строки могли быть посчитаны неверно (см.
    // комментарий выше), оставлять их рядом с новыми означало бы задвоить пеню за одни и
    // те же дни.
    await this.prisma.$transaction([
      this.prisma.penaltyAccrualLog.deleteMany({ where: { contractId } }),
      ...(rows.length > 0 ? [this.prisma.penaltyAccrualLog.createMany({ data: rows })] : []),
      this.prisma.contract.update({ where: { id: contractId }, data: { penaltyAccruedThrough: today } }),
    ]);

    return { rowsCreated: rows.length, totalAdded };
  }
}
