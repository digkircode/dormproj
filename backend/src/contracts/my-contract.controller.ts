import { BadRequestException, Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { computePenaltyBalance } from '../billing/penalty-balance';
import { dateOnly } from '../billing/period-utils';
import { serializeAccrual, serializePayment, serializeTerms } from './serializers';
import { pickCurrentCharacteristics } from '../rooms/current-characteristics';
import { buildPaymentPurpose } from '../billing/payment-purpose';
import { buildContractHomeSummary } from './contract-home-summary';

const CORPUS_DEFINITION_NAME = 'Корпус';
const FLOOR_DEFINITION_NAME = 'Этаж';
const CAPACITY_DEFINITION_NAME = 'Количество мест';

@Controller('my-contract')
@UseGuards(AuthGuard, RolesGuard)
@Roles('RESIDENT')
export class MyContractController {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveIndividualUid(userId: number): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { univerId: true } });
    if (!user?.univerId) {
      throw new BadRequestException('contracts.errors.accountNotLinked');
    }
    return user.univerId;
  }

  @Get('list')
  async myContracts(@Req() req: Request) {
    if (!req.user) {
      throw new BadRequestException('contracts.errors.sessionUserNotFound');
    }
    const individualUid = await this.resolveIndividualUid(req.user.id);
    const contracts = await this.prisma.contract.findMany({
      where: { residentIndividualUid: individualUid },
      orderBy: { contractDate: 'desc' },
      select: { id: true, number: true, status: true, contractDate: true, endDate: true },
    });
    return { contracts };
  }

  @Get()
  async myContract(@Query('contractId') contractIdParam: string | undefined, @Req() req: Request) {
    if (!req.user) {
      throw new BadRequestException('contracts.errors.sessionUserNotFound');
    }
    const individualUid = await this.resolveIndividualUid(req.user.id);
    const contractId = contractIdParam ? Number.parseInt(contractIdParam, 10) : undefined;
    if (contractIdParam !== undefined && !Number.isInteger(contractId)) {
      throw new BadRequestException('contracts.errors.invalidContractId');
    }

    const contract = await this.prisma.contract.findFirst({
      where: contractId ? { id: contractId, residentIndividualUid: individualUid } : { residentIndividualUid: individualUid },
      orderBy: { contractDate: 'desc' },
      include: {
        resident: { select: { fullName: true } },
        terms: { orderBy: { validFrom: 'desc' } },
        roomAssignments: { orderBy: { fromDate: 'desc' }, include: { room: { select: { id: true, room: true } } } },
        accruals: {
          orderBy: { periodStart: 'asc' },
          include: { allocations: { include: { payment: { select: { paidAt: true, reversedAt: true } } } }, refunds: true },
        },
        payments: {
          orderBy: { paidAt: 'desc' },
          include: {
            paymentIntent: { select: { payerFullName: true } },
            allocations: { include: { accrual: { select: { periodStart: true } } } },
          },
        },
        penaltyLogs: true,
      },
    });
    if (!contract) {
      return { contract: null };
    }

    const { terms, roomAssignments, accruals, payments, penaltyLogs, resident, ...contractFields } = contract;
    const { penaltyAmount, penaltyPaid, penaltyBalance } = computePenaltyBalance({
      asOf: dateOnly(new Date()),
      penaltyLogs,
      payments,
    });

    const rawCurrentRoom = roomAssignments.find((a) => a.toDate === null)?.room ?? roomAssignments[0]?.room ?? null;
    let currentRoom: (typeof rawCurrentRoom & { corpus: string | null; floor: number | null; capacity: number | null }) | null = null;
    if (rawCurrentRoom) {
      const characteristicValues = await this.prisma.roomCharacteristicValue.findMany({
        where: { roomId: rawCurrentRoom.id },
        include: { definition: true },
        orderBy: [{ period: 'desc' }, { definition: { name: 'asc' } }],
      });
      const characteristics = pickCurrentCharacteristics(characteristicValues);
      const findValue = (name: string) => characteristics.find((c) => c.name === name)?.value ?? null;
      currentRoom = {
        ...rawCurrentRoom,
        corpus: (findValue(CORPUS_DEFINITION_NAME) as string | null) ?? null,
        floor: (findValue(FLOOR_DEFINITION_NAME) as number | null) ?? null,
        capacity: (findValue(CAPACITY_DEFINITION_NAME) as number | null) ?? null,
      };
    }

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
        currentRoom,
        penaltyAmount: Number(penaltyAmount),
        penaltyPaid: Number(penaltyPaid),
        penaltyBalance: Number(penaltyBalance),
        creditBalance: Number(contractFields.creditBalance),
        penaltyLog: penaltyLogs
          .slice()
          .sort((a, b) => a.date.getTime() - b.date.getTime())
          .map((l) => ({ date: l.date, amount: Number(l.amount), overdueBase: Number(l.overdueBase) })),
        terms: terms.map(serializeTerms),
        accruals: accruals.map(serializeAccrual),
        payments: payments.map((payment) =>
          serializePayment({
            ...payment,
            purpose: buildPaymentPurpose({
              source: payment.source,
              residentFullName: resident.fullName,
              payerFullName: payment.paymentIntent?.payerFullName,
              periodStarts: payment.allocations.map((a) => a.accrual.periodStart),
              includePenalty: payment.penaltyAmount.greaterThan(0),
              fallbackPeriodDate: payment.paidAt,
            }),
          }),
        ),
      },
    };
  }

  @Get('summary')
  async myContractSummary(@Req() req: Request) {
    if (!req.user) {
      throw new BadRequestException('contracts.errors.sessionUserNotFound');
    }
    const individualUid = await this.resolveIndividualUid(req.user.id);
    const contract = await buildContractHomeSummary(this.prisma, { residentIndividualUid: individualUid });
    return { contract };
  }
}
