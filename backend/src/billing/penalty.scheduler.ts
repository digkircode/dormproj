import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { PENALTY_DAILY_RATE } from './accrual-generation';
import { addDays, dateOnly, daysBetweenInclusive } from './period-utils';
import { buildAccrualPenaltyCalcs, earliestPenaltyStartsAt, overdueSumOnDay } from './penalty-calc';

export const PENALTY_SYNC_TYPE = 'penalties';

const { Decimal } = Prisma;
const CONTRACT_BATCH_SIZE = 50;
const PENALTY_INSERT_CHUNK_SIZE = 1000;

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

  private async runLogged(task: () => Promise<Record<string, unknown>>): Promise<void> {
    const startedAt = Date.now();
    let log: { id: number };
    try {
      log = await this.prisma.syncLog.create({
        data: { type: PENALTY_SYNC_TYPE, trigger: 'CRON', status: 'RUNNING', details: { operation: 'DAILY_ACCRUAL' } },
        select: { id: true },
      });
    } catch (error) {
      this.logger.error(`Не удалось создать лог автоматического начисления пени: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    try {
      const details = await task();
      await this.prisma.syncLog.update({
        where: { id: log.id },
        data: { status: 'SUCCESS', finishedAt: new Date(), details: { operation: 'DAILY_ACCRUAL', ...details, durationMs: Date.now() - startedAt } },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.syncLog.update({
        where: { id: log.id },
        data: { status: 'FAILED', finishedAt: new Date(), errorMessage: message, details: { operation: 'DAILY_ACCRUAL', durationMs: Date.now() - startedAt } },
      }).catch(() => undefined);
      this.logger.error(`Ошибка автоматического начисления пени: ${message}`);
    }
  }

  // Позже ночного синка 1С (01:00) — чтобы не спорить за БД с ним.
  @Cron('0 2 * * *', { timeZone: 'Europe/Moscow' })
  async accruePenalties(): Promise<void> {
    await this.runLogged(async () => this.accruePenaltiesInternal());
  }

  private async accruePenaltiesInternal(): Promise<Record<string, unknown>> {
    const today = dateOnly(new Date());
    // Грубый префильтр — пеня стартует не раньше 10 числа месяца, следующего за
    // periodStart, то есть минимум через ~10 дней после periodStart (periodStart в конце
    // длинного месяца, следующий короткий) — точная проверка (grace period, маткапитал,
    // остаток) уже в цикле ниже, дороже гонять её без предварительного отсева. periodStart
    // не индексирован, но на текущем объёме (см. известные проблемы в промпте проекта) это
    // не критично.
    let cursor = 0;
    let processedContracts = 0;
    let penaltyRowsCreated = 0;
    let totalAdded = new Decimal(0);
    while (true) {
      const contracts = await this.prisma.contract.findMany({
        where: { id: { gt: cursor }, accruals: { some: { voidedAt: null, periodStart: { lte: addDays(today, -10) } } } },
        orderBy: { id: 'asc' }, take: CONTRACT_BATCH_SIZE,
        include: {
          accruals: {
            where: { voidedAt: null },
            include: {
              // paidAt/reversedAt are needed for each missed day's balance.
              allocations: { include: { payment: { select: { paidAt: true, reversedAt: true } } } },
            },
          },
        },
      });
      if (contracts.length === 0) break;
      cursor = contracts[contracts.length - 1].id;
      const logRows: { contractId: number; date: Date; amount: Prisma.Decimal; overdueBase: Prisma.Decimal }[] = [];
      const updatedContractIds: number[] = [];

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

        if (rowsForContract > 0) {
          this.logger.log(
            `Договор №${contract.number} (id=${contract.id}): обработано дней ${daysElapsed} ` +
              `(с ${addDays(sinceDate, 1).toISOString().slice(0, 10)} по ${today.toISOString().slice(0, 10)}), ` +
              `из них с пеней ${rowsForContract}, рассчитано ${contractTotal.toFixed(2)}`,
          );
        }
      }

      if (updatedContractIds.length > 0) {
        // Journal rows and the progress marker commit together. A failed batch
        // remains available to the next run; completed batches are skipped.
        const inserted = await this.prisma.$transaction(async (tx) => {
          let count = 0;
          let added = new Decimal(0);
          for (let offset = 0; offset < logRows.length; offset += PENALTY_INSERT_CHUNK_SIZE) {
            const rows = await tx.penaltyAccrualLog.createManyAndReturn({
              data: logRows.slice(offset, offset + PENALTY_INSERT_CHUNK_SIZE), skipDuplicates: true,
              select: { amount: true },
            });
            count += rows.length;
            added = rows.reduce((sum, row) => sum.plus(row.amount), added);
          }
          await tx.contract.updateMany({ where: { id: { in: updatedContractIds } }, data: { penaltyAccruedThrough: today } });
          return { count, added };
        }, { timeout: 120_000 });
        processedContracts += updatedContractIds.length;
        penaltyRowsCreated += inserted.count;
        totalAdded = totalAdded.plus(inserted.added);
      }
    }

    this.logger.log(
      `Начисление пени: обновлено договоров - ${processedContracts}, строк журнала - ${penaltyRowsCreated}, добавлено всего - ${totalAdded.toFixed(2)}`,
    );
    return {
      processedContracts,
      penaltyRowsCreated,
      totalAdded: Number(totalAdded),
    };
  }
}
