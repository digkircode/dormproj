import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { PENALTY_DAILY_RATE } from './accrual-generation';
import { addDays, dateOnly, daysBetweenInclusive } from './period-utils';
import { buildAccrualPenaltyCalcs, earliestPenaltyStartsAt, overdueSumOnDay } from './penalty-calc';

const { Decimal } = Prisma;

// Ночной крон — 0,14%/день (п. 4.8/5.9 договора) от суммы всех ПРОСРОЧЕННЫХ и непогашенных
// начислений договора ЦЕЛИКОМ (не по каждому начислению отдельно) — начисление считается
// просроченным с 10 числа месяца, следующего за его periodStart (см. penaltyStartsAt в
// accrual-generation.ts). Сам расчёт базы на конкретный день — в penalty-calc.ts, общий с
// ручным пересчётом по кнопке сотрудника (penalty-recalculate.service.ts).
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

    const logRows: { contractId: number; date: Date; amount: Prisma.Decimal; overdueBase: Prisma.Decimal }[] = [];
    const updatedContractIds: number[] = [];
    let totalAdded = new Decimal(0);

    for (const contract of contracts) {
      const calcs = await buildAccrualPenaltyCalcs(this.prisma, contract, contract.accruals);
      if (calcs.length === 0) continue;
      const earliestStartsAt = earliestPenaltyStartsAt(calcs);
      if (!earliestStartsAt) continue;

      const sinceDate = contract.penaltyAccruedThrough ?? addDays(earliestStartsAt, -1);
      if (sinceDate >= today) continue;
      const daysElapsed = daysBetweenInclusive(addDays(sinceDate, 1), today);
      if (daysElapsed <= 0) continue;

      let contractTotal = new Decimal(0);
      let rowsForContract = 0;

      for (let i = 1; i <= daysElapsed; i++) {
        const day = addDays(sinceDate, i);
        const overdueSum = overdueSumOnDay(calcs, day, contract.matCapitalDeferredUntil);

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
