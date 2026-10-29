import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { PenaltyRecalculateService } from './penalty-recalculate.service';

const CONTRACT_BATCH_SIZE = 50;

@Injectable()
export class PenaltyReconciliationScheduler {
  private readonly logger = new Logger(PenaltyReconciliationScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly penaltyRecalculate: PenaltyRecalculateService,
  ) {}

  @Cron('30 0 * * *', { name: 'sync-penalty-reconciliation', timeZone: 'Europe/Moscow' })
  async reconcileHistoricalPenalties(): Promise<void> {
    const startedAt = Date.now();
    let log: { id: number };
    try {
      log = await this.prisma.syncLog.create({
        data: { type: 'penalty-reconciliation', trigger: 'CRON', status: 'RUNNING', details: { operation: 'HISTORICAL_RECALCULATION' } },
        select: { id: true },
      });
    } catch (error) {
      this.logger.error(`Не удалось создать лог ночной сверки пеней: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    let cursor = 0;
    let processedContracts = 0;
    let changedContracts = 0;
    let failedContracts = 0;
    try {
      while (true) {
        const contracts = await this.prisma.contract.findMany({
          where: { id: { gt: cursor }, penaltyRecalcPending: true },
          orderBy: { id: 'asc' },
          take: CONTRACT_BATCH_SIZE,
          select: { id: true, number: true },
        });
        if (contracts.length === 0) break;
        cursor = contracts[contracts.length - 1].id;

        for (const contract of contracts) {
          try {
            const result = await this.penaltyRecalculate.reconcileChronological(contract.id);
            processedContracts++;
            if (result.changed) changedContracts++;
          } catch (error) {
            failedContracts++;
            this.logger.error(`Не удалось пересчитать пеню по договору №${contract.number}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }

      await this.prisma.syncLog.update({
        where: { id: log.id },
        data: {
          status: failedContracts > 0 ? 'FAILED' : 'SUCCESS',
          finishedAt: new Date(),
          errorMessage: failedContracts > 0 ? `Не удалось пересчитать пеню по ${failedContracts} договорам` : null,
          details: { operation: 'HISTORICAL_RECALCULATION', processedContracts, changedContracts, failedContracts, durationMs: Date.now() - startedAt },
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.syncLog.update({
        where: { id: log.id },
        data: {
          status: 'FAILED', finishedAt: new Date(), errorMessage: message,
          details: { operation: 'HISTORICAL_RECALCULATION', processedContracts, changedContracts, failedContracts, durationMs: Date.now() - startedAt },
        },
      }).catch(() => undefined);
      this.logger.error(`Ошибка ночной сверки пеней: ${message}`);
    }
  }
}
