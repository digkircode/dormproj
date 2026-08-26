import { BadRequestException, Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
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

  // Список ВСЕХ договоров проживающего (может быть больше одного одновременно — новый
  // договор не обязан ждать окончания предыдущего, см. schema.prisma: у Contract нет
  // uniqueness по residentIndividualUid) — питает переключатель договора на карточке
  // (MyContract.vue) и в модалке оплаты (CreatePaymentDialog.vue), добавлено 2026-08-25.
  @Get('list')
  async myContracts(@Req() req: Request) {
    if (!req.user) {
      throw new BadRequestException('Не удалось определить пользователя сессии');
    }
    const individualUid = await this.resolveIndividualUid(req.user.id);
    const contracts = await this.prisma.contract.findMany({
      where: { residentIndividualUid: individualUid },
      orderBy: { contractDate: 'desc' },
      select: { id: true, number: true, status: true, contractDate: true, endDate: true },
    });
    return { contracts };
  }

  // Самый свежий по дате договор этого проживающего — независимо от статуса (в отличие от
  // шапки чата/сотруднического resident-info, где нужен именно ДЕЙСТВУЮЩИЙ договор для
  // быстрого контекста диалога). Здесь это отдельная страница "Договор/Платежи" — расторгнутый
  // договор для резидента тоже осмысленная информация, не только активный. contractId — явный
  // выбор из переключателя (см. myContracts выше); без него — поведение как раньше (самый
  // свежий). Принадлежность resident'у проверяется прямо в where — чужой id просто не найдётся.
  @Get()
  async myContract(@Query('contractId') contractIdParam: string | undefined, @Req() req: Request) {
    if (!req.user) {
      throw new BadRequestException('Не удалось определить пользователя сессии');
    }
    const individualUid = await this.resolveIndividualUid(req.user.id);
    const contractId = contractIdParam ? Number.parseInt(contractIdParam, 10) : undefined;
    if (contractIdParam !== undefined && !Number.isInteger(contractId)) {
      throw new BadRequestException('Некорректный contractId');
    }

    const contract = await this.prisma.contract.findFirst({
      where: contractId ? { id: contractId, residentIndividualUid: individualUid } : { residentIndividualUid: individualUid },
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
        createdAt: contractFields.createdAt,
        currentRoom: roomAssignments.find((a) => a.toDate === null)?.room ?? roomAssignments[0]?.room ?? null,
        penaltyAmount: Number(penaltyAmount),
        penaltyPaid: Number(penaltyPaid),
        penaltyBalance: Number(penaltyBalance),
        // Журнал начисления пени по дням (дата/сумма за день/база расчёта) — для клика по
        // тайлу "Пени" на карточке (MyContract.vue), показывает, откуда взялась сумма
        // (amount = overdueBase * 0.14%, см. billing/penalty.scheduler.ts). По дате, старые
        // сверху вниз — так же, как начисления таблицей выше.
        penaltyLog: penaltyLogs
          .slice()
          .sort((a, b) => a.date.getTime() - b.date.getTime())
          .map((l) => ({ date: l.date, amount: Number(l.amount), overdueBase: Number(l.overdueBase) })),
        terms: terms.map(serializeTerms),
        accruals: accruals.map(serializeAccrual),
        payments: payments.map(serializePayment),
      },
    };
  }
}
