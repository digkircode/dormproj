import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, type ContractStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { computePenaltyBalance } from './penalty-balance';
import { dateOnly } from './period-utils';

const { Decimal } = Prisma;
const EXPIRING_WINDOW_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Ночной крон — переводит договоры по жизненному циклу (см. ContractStatus в schema.prisma):
// ACTIVE -> EXPIRING, когда до endDate осталось ≤30 дней; ACTIVE/EXPIRING -> COMPLETED
// (endDate прошёл, долга по начислениям+пене нет) или OVERDUE (endDate прошёл, долг есть).
// TERMINATED этот крон не трогает вообще (не в выборке ниже) и никогда сюда не
// возвращает — единственный статус, проставляемый только вручную (см.
// contracts.controller.ts#terminate). OVERDUE/COMPLETED пересматриваются на каждом
// прогоне (не только один раз при первом переходе за endDate) — платёж задним числом
// или сторно платежа может поменять итог уже после того, как договор проехал endDate.
@Injectable()
export class ContractStatusScheduler {
  private readonly logger = new Logger(ContractStatusScheduler.name);

  constructor(private readonly prisma: PrismaService, private readonly auditLog: AuditLogService) {}

  private async transition(contract: { id: number; number: string; status: ContractStatus }, status: 'EXPIRING' | 'OVERDUE' | 'COMPLETED'): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.contract.updateMany({ where: { id: contract.id, status: contract.status }, data: { status } });
      if (!result.count) return false;
      await this.auditLog.log(tx, {
        userId: null,
        action: 'UPDATE',
        entityType: 'Contract',
        entityId: contract.id,
        entityLabel: contract.number,
        before: { status: contract.status },
        after: { status },
        fields: ['status'],
      });
      return true;
    });
  }

  // Между синком 1С (01:00) и начислением пени (02:00, см. billing/penalty.scheduler.ts) —
  // сам расчёт пени от статуса договора не зависит, порядок не критичен, просто держим
  // все три ночных крона в одном известном окне.
  @Cron('30 1 * * *', { timeZone: 'Europe/Moscow' })
  async transitionStatuses(): Promise<void> {
    const today = dateOnly(new Date());
    const expiringThreshold = new Date(today.getTime() + EXPIRING_WINDOW_DAYS * MS_PER_DAY);

    const contracts = await this.prisma.contract.findMany({
      where: { status: { in: ['ACTIVE', 'EXPIRING', 'OVERDUE', 'COMPLETED'] } },
      include: {
        accruals: { where: { voidedAt: null }, include: { allocations: { include: { payment: { select: { paidAt: true, reversedAt: true } } } } } },
        payments: true,
        penaltyLogs: true,
      },
    });

    let toExpiring = 0;
    let toCompleted = 0;
    let toOverdue = 0;

    for (const contract of contracts) {
      if (contract.endDate < today) {
        const principalDebt = contract.accruals.reduce((sum, accrual) => {
          if (accrual.dueDate > today) return sum;
          const total = accrual.rentAmount.plus(accrual.utilitiesAmount).plus(accrual.adjustmentAmount);
          const paid = accrual.allocations
            .filter((al) => !al.payment.reversedAt && al.payment.paidAt <= today)
            .reduce((s, al) => s.plus(al.amount), new Decimal(0));
          return sum.plus(total.minus(paid));
        }, new Decimal(0));
        const { penaltyBalance } = computePenaltyBalance({ asOf: today, penaltyLogs: contract.penaltyLogs, payments: contract.payments });
        const nextStatus = principalDebt.plus(penaltyBalance).greaterThan(0) ? 'OVERDUE' : 'COMPLETED';
        if (contract.status !== nextStatus) {
          if (await this.transition(contract, nextStatus)) {
            if (nextStatus === 'OVERDUE') toOverdue++;
            else toCompleted++;
          }
        }
        continue;
      }

      if (contract.status === 'ACTIVE' && contract.endDate <= expiringThreshold) {
        if (await this.transition(contract, 'EXPIRING')) toExpiring++;
      }
    }

    this.logger.log(
      `Переход статусов договоров: в "Истекает" - ${toExpiring}, в "Завершён" - ${toCompleted}, в "Просрочен" - ${toOverdue}`,
    );
  }
}
