import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { PENALTY_DAILY_RATE, isFullMonthAccrualPeriod, penaltyStartsAt } from './accrual-generation';
import { addDays, dateOnly, daysBetweenInclusive } from './period-utils';

const { Decimal } = Prisma;

// Ночной крон — 0,14%/день (п. 4.8/5.9 договора) от суммы всех ПРОСРОЧЕННЫХ и непогашенных
// начислений договора ЦЕЛИКОМ (не по каждому начислению отдельно) — начисление считается
// просроченным с 10 числа месяца, следующего за его periodStart (см. penaltyStartsAt).
// База по каждому начислению — стоимость комнаты за месяц целиком (principal), а не остаток
// после частичной оплаты, кроме посуточных начислений (неполный месяц/комнаты 112-2/410-2),
// где своей "стоимости" нет и берётся фактически начисленная сумма — см. правку 2026-08-31
// ниже.
// Каждый начисленный день — отдельная строка PenaltyAccrualLog (не общий инкремент одним
// числом): и аудит "откуда взялась сумма" (по прямой просьбе 2026-08-22), и единственный
// способ восстановить пеню на прошлую дату для финансового отчёта (сумма строк журнала по
// эту дату, см. billing/penalty-balance.ts). Идемпотентно: penaltyAccruedThrough на
// Contract не даёт начислить дважды за один день (плюс @@unique([contractId, date]) в
// БД — защита на случай гонки/повторного запуска), а при пропуске запуска (сервер был
// недоступен) досчитывает за все пропущенные дни разом — по одной строке на каждый день,
// все с ТЕКУЩЕЙ базой (та же упрощающая посылка, что была и раньше в этом кроне — база за
// пропущенные дни назад не восстанавливается).
@Injectable()
export class PenaltyScheduler {
  private readonly logger = new Logger(PenaltyScheduler.name);

  constructor(private readonly prisma: PrismaService) {}

  // Позже ночного синка 1С (01:00) — чтобы не спорить за БД с ним.
  @Cron('0 2 * * *', { timeZone: 'Europe/Moscow' })
  async accruePenalties(): Promise<void> {
    const today = dateOnly(new Date());
    // Грубый префильтр — пеня стартует не раньше 10 числа месяца, следующего за
    // periodStart, то есть минимум через ~10 дней после periodStart (periodStart в конце
    // длинного месяца, следующий короткий) — точная проверка (grace period, маткапитал,
    // остаток) уже в цикле ниже, дороже гонять её без предварительного отсева. periodStart
    // не индексирован, но на текущем объёме (см. известные проблемы в промпте проекта) это
    // не критично.
    const contracts = await this.prisma.contract.findMany({
      where: { accruals: { some: { voidedAt: null, periodStart: { lte: addDays(today, -10) } } } },
      include: { accruals: { where: { voidedAt: null }, include: { allocations: true } } },
    });

    const logRows: { contractId: number; date: Date; amount: Prisma.Decimal; overdueBase: Prisma.Decimal }[] = [];
    const updatedContractIds: number[] = [];
    let totalAdded = new Decimal(0);

    for (const contract of contracts) {
      let overdueSum = new Decimal(0);
      let earliestStartsAt: Date | null = null;

      for (const accrual of contract.accruals) {
        const startsAt = penaltyStartsAt(accrual.periodStart);
        if (today < startsAt) continue;

        const withinMatCapitalPeriod =
          contract.matCapitalCoveredFrom &&
          contract.matCapitalCoveredTo &&
          accrual.periodStart >= contract.matCapitalCoveredFrom &&
          accrual.periodStart <= contract.matCapitalCoveredTo;
        if (withinMatCapitalPeriod && contract.matCapitalDeferredUntil && today <= contract.matCapitalDeferredUntil) {
          continue;
        }

        const principal = accrual.rentAmount.plus(accrual.utilitiesAmount).plus(accrual.adjustmentAmount);
        const paid = accrual.allocations.reduce((sum, a) => sum.plus(a.amount), new Decimal(0));
        const outstanding = principal.minus(paid);
        if (outstanding.lessThanOrEqualTo(0)) continue;

        // База пени — по прямой просьбе (2026-08-31, найдено пользователем при сверке с
        // реальными данными): для ОБЫЧНОГО (не посуточного) начисления это фиксированная
        // стоимость комнаты за месяц (principal, найм+коммуналка+корректировка) — частичная
        // оплата НЕ уменьшает базу, пока начисление не закрыто полностью (см. `continue`
        // выше на outstanding<=0). Уменьшается от факта оплаты база только у посуточных
        // начислений (неполный крайний месяц ИЛИ комната без месячной "Стоимости", 112-2/
        // 410-2 — там rentAmount/utilitiesAmount не два раздельных обязательства, а один и
        // тот же посуточный платёж, искусственно разбитый пополам для отчётности, см.
        // accrual-generation.ts#computeAccrualAmounts, поэтому для них берём фактическую
        // (уже уменьшенную оплатой) сумму, как и раньше).
        const terms = await this.prisma.contractTerms.findFirst({
          where: {
            contractId: contract.id,
            validFrom: { lte: accrual.periodStart },
            OR: [{ validTo: null }, { validTo: { gt: accrual.periodStart } }],
          },
          orderBy: { validFrom: 'desc' },
        });
        // rentAmount=0 и utilitiesAmount=0 одновременно на ContractTerms — признак полностью
        // посуточной комнаты (см. termination.ts#isDailyOnly), обычная комната всегда имеет
        // ненулевую месячную "Стоимость".
        const isDailyOnlyRoom = !!terms && terms.rentAmount.isZero() && terms.utilitiesAmount.isZero();
        const isDailyRateAccrual = isDailyOnlyRoom || !isFullMonthAccrualPeriod(accrual.periodStart, accrual.periodEnd);
        const penaltyBase = isDailyRateAccrual ? outstanding : principal;

        overdueSum = overdueSum.plus(penaltyBase);
        if (!earliestStartsAt || startsAt < earliestStartsAt) earliestStartsAt = startsAt;
      }

      if (overdueSum.lessThanOrEqualTo(0) || !earliestStartsAt) continue;

      const sinceDate = contract.penaltyAccruedThrough ?? addDays(earliestStartsAt, -1);
      if (sinceDate >= today) continue;
      const daysElapsed = daysBetweenInclusive(addDays(sinceDate, 1), today);
      if (daysElapsed <= 0) continue;

      const dailyAmount = overdueSum.times(PENALTY_DAILY_RATE);
      for (let i = 1; i <= daysElapsed; i++) {
        logRows.push({ contractId: contract.id, date: addDays(sinceDate, i), amount: dailyAmount, overdueBase: overdueSum });
      }
      updatedContractIds.push(contract.id);
      const contractTotal = dailyAmount.times(daysElapsed);
      totalAdded = totalAdded.plus(contractTotal);

      this.logger.log(
        `Договор №${contract.number} (id=${contract.id}): база просрочки ${overdueSum.toFixed(2)}, ` +
          `дней к начислению ${daysElapsed} (с ${sinceDate.toISOString().slice(0, 10)} по ${today.toISOString().slice(0, 10)}), ` +
          `пеня/день ${dailyAmount.toFixed(2)}, добавлено всего ${contractTotal.toFixed(2)}`,
      );
    }

    if (logRows.length > 0) {
      await this.prisma.penaltyAccrualLog.createMany({ data: logRows, skipDuplicates: true });
      await this.prisma.contract.updateMany({ where: { id: { in: updatedContractIds } }, data: { penaltyAccruedThrough: today } });
    }

    this.logger.log(
      `Начисление пени: обновлено договоров — ${updatedContractIds.length}, строк журнала — ${logRows.length}, всего добавлено — ${totalAdded.toFixed(2)}`,
    );
  }
}
