import { BadRequestException, Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { computePenaltyBalance } from '../billing/penalty-balance';
import { dateOnly } from '../billing/period-utils';
import { serializeAccrual, serializePayment, serializeTerms } from './serializers';

// Договор самого проживающего — не /contracts/:id (тот целиком STAFF/ADMIN-only, класс-
// уровня @Roles('STAFF','ADMIN') не сузить снаружи, см. промпт проекта), поэтому отдельный
// контроллер, тот же паттерн, что my-chat.controller.ts. БЕЗ :id в маршруте вообще —
// резидент получает СВОЙ договор по individualUid из собственной сессии, id договора
// нигде не принимается от клиента, поэтому "посмотреть чужой по ссылке" структурно
// невозможно (в отличие от /contracts/:id, куда достаточно было бы просто подставить
// другой id).
@Controller('my-contract')
@UseGuards(AuthGuard, RolesGuard)
@Roles('RESIDENT')
export class MyContractController {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveIndividualUid(userId: number): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { univerId: true } });
    // Та же защитная проверка, что и в my-chat.controller.ts — роль RESIDENT выдаётся
    // только вместе с валидным univerId, это заслон на непредвиденное рассинхронизированное
    // состояние, а не штатный путь.
    if (!user?.univerId) {
      throw new BadRequestException('Аккаунт не привязан к физическому лицу — информация о договоре недоступна');
    }
    return user.univerId;
  }

  // Самый свежий по дате договор этого проживающего — независимо от статуса (в отличие от
  // шапки чата/сотруднического resident-info, где нужен именно ДЕЙСТВУЮЩИЙ договор для
  // быстрого контекста диалога). Здесь это отдельная страница "Информация о договоре" —
  // расторгнутый договор для резидента тоже осмысленная информация, не только активный.
  @Get()
  async myContract(@Req() req: Request) {
    if (!req.user) {
      throw new BadRequestException('Не удалось определить пользователя сессии');
    }
    const individualUid = await this.resolveIndividualUid(req.user.id);

    const contract = await this.prisma.contract.findFirst({
      where: { residentIndividualUid: individualUid },
      orderBy: { contractDate: 'desc' },
      include: {
        terms: { orderBy: { validFrom: 'desc' } },
        roomAssignments: { orderBy: { fromDate: 'desc' }, include: { room: { select: { id: true, room: true } } } },
        accruals: {
          orderBy: { periodStart: 'asc' },
          include: { allocations: { include: { payment: { select: { paidAt: true, reversedAt: true } } } } },
        },
        payments: { orderBy: { paidAt: 'desc' } },
        penaltyLogs: true,
      },
    });
    if (!contract) {
      return { contract: null };
    }

    const { terms, roomAssignments, accruals, payments, penaltyLogs, ...contractFields } = contract;
    const { penaltyAmount, penaltyPaid, penaltyBalance } = computePenaltyBalance({
      asOf: dateOnly(new Date()),
      penaltyLogs,
      accruals,
      payments,
    });

    return {
      contract: {
        id: contractFields.id,
        number: contractFields.number,
        contractDate: contractFields.contractDate,
        startDate: contractFields.startDate,
        endDate: contractFields.endDate,
        actualEndDate: contractFields.actualEndDate,
        status: contractFields.status,
        currentRoom: roomAssignments.find((a) => a.toDate === null)?.room ?? roomAssignments[0]?.room ?? null,
        penaltyAmount: Number(penaltyAmount),
        penaltyPaid: Number(penaltyPaid),
        penaltyBalance: Number(penaltyBalance),
        terms: terms.map(serializeTerms),
        accruals: accruals.map(serializeAccrual),
        payments: payments.map(serializePayment),
      },
    };
  }
}
