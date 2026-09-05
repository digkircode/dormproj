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
// Contract не даёт начислить дважды за один день (плюс @@unique([contractId, date]) в БД —
// защита на случай гонки/повторного запуска).
//
// Если крон пропустил несколько дней подряд (сервер лежал, ИЛИ — по прямой просьбе
// 2026-09-05 — договор занесён задним числом спустя месяцы после заселения), база пени
// пересчитывается ОТДЕЛЬНО НА КАЖДЫЙ пропущенный день, а не берётся один раз "на сегодня"
// и не размножается на весь период (так было раньше — самый частый практический эффект:
// первые дни просрочки получали пеню от долга, который на самом деле накопился только
// позже). "Оплачено ли начисление" на каждый день считается по факту — какие платежи с
// какой датой paidAt реально были СДЕЛАНЫ К ЭТОМУ дню, а не оплачено ли начисление вообще
// на текущий момент — иначе платёж, поступивший уже ПОСЛЕ занесения договора (например,
// подтягивается вместе с ним, задним числом), задним же числом убрал бы пеню и за более
// ранние дни, когда долг по факту ещё висел.
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
      include: {
        accruals: {
          where: { voidedAt: null },
          include: {
            // paidAt/reversedAt — чтобы на каждый день катч-апа знать, какие именно платежи
            // УЖЕ БЫЛИ на тот день (не текущее состояние оплаты, см. комментарий выше).
            allocations: { include: { payment: { select: { paidAt: true, reversedAt: true } } } },
          },
        },
      },
    });

    // Статичная (не зависящая от конкретного дня D) часть расчёта по начислению — считается
    // один раз на начисление, не на каждый день катч-апа.
    interface AccrualCalc {
      startsAt: Date;
      principal: Prisma.Decimal;
      isDailyRateAccrual: boolean;
      matCapitalExempt: boolean; // periodStart попадает в период, закрытый маткапиталом
      payments: { amount: Prisma.Decimal; paidAt: Date }[]; // только неотсторнированные
    }

    const logRows: { contractId: number; date: Date; amount: Prisma.Decimal; overdueBase: Prisma.Decimal }[] = [];
    const updatedContractIds: number[] = [];
    let totalAdded = new Decimal(0);

    for (const contract of contracts) {
      const calcs: AccrualCalc[] = [];

      for (const accrual of contract.accruals) {
        const principal = accrual.rentAmount.plus(accrual.utilitiesAmount).plus(accrual.adjustmentAmount);

        // База пени — по прямой просьбе (2026-08-31, найдено пользователем при сверке с
        // реальными данными): для ОБЫЧНОГО (не посуточного) начисления это фиксированная
        // стоимость комнаты за месяц (principal, найм+коммуналка+корректировка) — частичная
        // оплата НЕ уменьшает базу, пока начисление не закрыто полностью. Уменьшается от
        // факта оплаты база только у посуточных начислений (неполный крайний месяц ИЛИ
        // комната без месячной "Стоимости", 112-2/410-2 — там rentAmount/utilitiesAmount не
        // два раздельных обязательства, а один и тот же посуточный платёж, искусственно
        // разбитый пополам для отчётности, см. accrual-generation.ts#computeAccrualAmounts).
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

        const matCapitalExempt = Boolean(
          contract.matCapitalCoveredFrom &&
            contract.matCapitalCoveredTo &&
            accrual.periodStart >= contract.matCapitalCoveredFrom &&
            accrual.periodStart <= contract.matCapitalCoveredTo,
        );

        const payments = accrual.allocations
          .filter((a) => a.payment.reversedAt === null)
          .map((a) => ({ amount: a.amount, paidAt: a.payment.paidAt }));

        calcs.push({
          startsAt: penaltyStartsAt(accrual.periodStart),
          principal,
          isDailyRateAccrual,
          matCapitalExempt,
          payments,
        });
      }

      if (calcs.length === 0) continue;
      const earliestStartsAt = calcs.reduce((min, c) => (!min || c.startsAt < min ? c.startsAt : min), null as Date | null);
      if (!earliestStartsAt) continue;

      const sinceDate = contract.penaltyAccruedThrough ?? addDays(earliestStartsAt, -1);
      if (sinceDate >= today) continue;
      const daysElapsed = daysBetweenInclusive(addDays(sinceDate, 1), today);
      if (daysElapsed <= 0) continue;

      let contractTotal = new Decimal(0);
      let rowsForContract = 0;

      for (let i = 1; i <= daysElapsed; i++) {
        const day = addDays(sinceDate, i);
        let overdueSum = new Decimal(0);

        for (const calc of calcs) {
          if (day < calc.startsAt) continue;
          if (calc.matCapitalExempt && contract.matCapitalDeferredUntil && day <= contract.matCapitalDeferredUntil) continue;

          const paidAsOfDay = calc.payments
            .filter((p) => p.paidAt <= day)
            .reduce((sum, p) => sum.plus(p.amount), new Decimal(0));
          const outstanding = calc.principal.minus(paidAsOfDay);
          if (outstanding.lessThanOrEqualTo(0)) continue;

          overdueSum = overdueSum.plus(calc.isDailyRateAccrual ? outstanding : calc.principal);
        }

        if (overdueSum.greaterThan(0)) {
          const dailyAmount = overdueSum.times(PENALTY_DAILY_RATE);
          logRows.push({ contractId: contract.id, date: day, amount: dailyAmount, overdueBase: overdueSum });
          contractTotal = contractTotal.plus(dailyAmount);
          rowsForContract++;
        }
      }

      // Помечаем договор обработанным по сегодня в любом случае (даже если ни одного дня
      // с реальным долгом не нашлось) — иначе следующий прогон отсчитает этот же
      // "тихий" промежуток заново, как будто долг всё это время был (см. промпт проекта,
      // код-ревью 2026-09-04).
      updatedContractIds.push(contract.id);
      totalAdded = totalAdded.plus(contractTotal);

      if (rowsForContract > 0) {
        this.logger.log(
          `Договор №${contract.number} (id=${contract.id}): обработано дней ${daysElapsed} ` +
            `(с ${addDays(sinceDate, 1).toISOString().slice(0, 10)} по ${today.toISOString().slice(0, 10)}), ` +
            `из них с пеней ${rowsForContract}, добавлено всего ${contractTotal.toFixed(2)}`,
        );
      }
    }

    if (logRows.length > 0) {
      await this.prisma.penaltyAccrualLog.createMany({ data: logRows, skipDuplicates: true });
    }
    if (updatedContractIds.length > 0) {
      await this.prisma.contract.updateMany({ where: { id: { in: updatedContractIds } }, data: { penaltyAccruedThrough: today } });
    }

    this.logger.log(
      `Начисление пени: обновлено договоров — ${updatedContractIds.length}, строк журнала — ${logRows.length}, всего добавлено — ${totalAdded.toFixed(2)}`,
    );
  }
}
