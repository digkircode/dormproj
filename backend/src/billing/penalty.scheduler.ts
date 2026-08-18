import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { PENALTY_DAILY_RATE, penaltyStartsAt } from './accrual-generation';
import { addDays, dateOnly, daysBetweenInclusive } from './period-utils';

const { Decimal } = Prisma;

// Ночной крон — 0,14%/день (п. 4.8/5.9 договора) от неоплаченного тела долга именно
// этого начисления (не пени на пеню, не общего долга по договору), начиная с dueDate+5
// (due day 5 -> с 10 числа). Идемпотентно: penaltyAccruedThrough не даёт начислить дважды
// за один день, а при пропуске запуска (сервер был недоступен) досчитывает за все
// пропущенные дни разом на следующем запуске — не теряет и не задваивает начисленное.
@Injectable()
export class PenaltyScheduler {
  private readonly logger = new Logger(PenaltyScheduler.name);

  constructor(private readonly prisma: PrismaService) {}

  // Позже ночного синка 1С (01:00) — чтобы не спорить за БД с ним.
  @Cron('0 2 * * *', { timeZone: 'Europe/Moscow' })
  async accruePenalties(): Promise<void> {
    const today = dateOnly(new Date());
    // Грубый префильтр на уровне БД (due_date индексирован) — точная проверка (grace period,
    // маткапитал, остаток) уже в цикле ниже, дороже гонять её без предварительного отсева.
    const candidates = await this.prisma.accrual.findMany({
      where: { voidedAt: null, dueDate: { lte: addDays(today, -5) } },
      include: { allocations: true, contract: true },
    });

    let updated = 0;
    for (const accrual of candidates) {
      const startsAt = penaltyStartsAt(accrual.dueDate);
      if (today < startsAt) continue;

      const { contract } = accrual;
      const withinMatCapitalPeriod =
        contract.matCapitalCoveredFrom &&
        contract.matCapitalCoveredTo &&
        accrual.periodStart >= contract.matCapitalCoveredFrom &&
        accrual.periodStart <= contract.matCapitalCoveredTo;
      if (withinMatCapitalPeriod && contract.matCapitalDeferredUntil && today <= contract.matCapitalDeferredUntil) {
        continue;
      }

      const principalTotal = accrual.rentAmount.plus(accrual.utilitiesAmount).plus(accrual.adjustmentAmount);
      const paidTotal = accrual.allocations.reduce((sum, a) => sum.plus(a.amount), new Decimal(0));
      const outstandingPrincipal = principalTotal.minus(paidTotal);
      if (outstandingPrincipal.lessThanOrEqualTo(0)) continue;

      const sinceDate = accrual.penaltyAccruedThrough ?? addDays(startsAt, -1);
      if (sinceDate >= today) continue;
      const daysElapsed = daysBetweenInclusive(addDays(sinceDate, 1), today);
      if (daysElapsed <= 0) continue;

      const newPenalty = outstandingPrincipal.times(PENALTY_DAILY_RATE).times(daysElapsed);
      await this.prisma.accrual.update({
        where: { id: accrual.id },
        data: { penaltyAmount: accrual.penaltyAmount.plus(newPenalty), penaltyAccruedThrough: today },
      });
      updated++;
    }

    this.logger.log(`Начисление пени: обновлено начислений — ${updated}`);
  }
}
