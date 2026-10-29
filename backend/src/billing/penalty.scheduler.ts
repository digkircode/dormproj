import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { PENALTY_DAILY_RATE } from './accrual-generation';
import { addDays, daysBetweenInclusive, moscowDateOnly } from './period-utils';
import { buildAccrualPenaltyCalcs, earliestPenaltyStartsAt, overdueSumOnDay } from './penalty-calc';

export const PENALTY_SYNC_TYPE = 'penalties';

const { Decimal } = Prisma;
const CONTRACT_BATCH_SIZE = 50;
const PENALTY_INSERT_CHUNK_SIZE = 1000;

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

  @Cron('0 2 * * *', { name: 'sync-penalties', timeZone: 'Europe/Moscow' })
  async accruePenalties(): Promise<void> {
    await this.runLogged(async () => this.accruePenaltiesInternal());
  }

  private async accruePenaltiesInternal(): Promise<Record<string, unknown>> {
    const today = moscowDateOnly(new Date());
    let cursor = 0;
    let processedContracts = 0;
    let penaltyRowsCreated = 0;
    let totalAdded = new Decimal(0);
    while (true) {
      const contracts = await this.prisma.contract.findMany({
        where: { id: { gt: cursor }, status: { not: 'TERMINATED' }, accruals: { some: { voidedAt: null, periodStart: { lte: addDays(today, -10) } } } },
        orderBy: { id: 'asc' }, take: CONTRACT_BATCH_SIZE,
        include: {
          accruals: {
            where: { voidedAt: null },
            include: {
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
        const inserted = await this.prisma.$transaction(async (tx) => {
          const eligible = await tx.contract.updateManyAndReturn({
            where: { id: { in: updatedContractIds }, status: { not: 'TERMINATED' } },
            data: { penaltyAccruedThrough: today },
            select: { id: true },
          });
          const eligibleIds = new Set(eligible.map((contract) => contract.id));
          const eligibleRows = logRows.filter((row) => eligibleIds.has(row.contractId));
          let count = 0;
          let added = new Decimal(0);
          for (let offset = 0; offset < eligibleRows.length; offset += PENALTY_INSERT_CHUNK_SIZE) {
            const rows = await tx.penaltyAccrualLog.createManyAndReturn({
              data: eligibleRows.slice(offset, offset + PENALTY_INSERT_CHUNK_SIZE), skipDuplicates: true,
              select: { amount: true },
            });
            count += rows.length;
            added = rows.reduce((sum, row) => sum.plus(row.amount), added);
          }
          return { count, added, processed: eligibleIds.size };
        }, { timeout: 120_000 });
        processedContracts += inserted.processed;
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
