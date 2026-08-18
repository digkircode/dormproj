import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { ContractStatus, Prisma } from '../../generated/prisma/client.js';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ensureUserRecord } from '../users/ensure-user';
import { buildAccrualsForContract } from '../billing/accrual-generation';
import { recalcAccrualsForTermination } from '../billing/termination';
import { serializeAccrual, serializePayment, serializeTerms } from './serializers';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// residentFullName — через связь resident, room намеренно не сортируем (текущая комната —
// производная от roomAssignments, не прямая колонка, как и в остальных списках проекта не
// всё отображаемое обязано быть сортируемым, см. passport.controller.ts).
const SORTABLE_FIELDS = ['number', 'residentFullName', 'startDate', 'endDate', 'status'] as const;
type SortableField = (typeof SORTABLE_FIELDS)[number];
function isSortableField(field: string): field is SortableField {
  return (SORTABLE_FIELDS as readonly string[]).includes(field);
}

const FILTERABLE_FIELDS = ['status'] as const;
type FilterableField = (typeof FILTERABLE_FIELDS)[number];
function isFilterableField(field: string): field is FilterableField {
  return (FILTERABLE_FIELDS as readonly string[]).includes(field);
}

const STATUS_LABELS: Record<ContractStatus, string> = {
  ACTIVE: 'Действует',
  TERMINATED: 'Расторгнут',
  EXPIRED: 'Истёк',
};

const legalRepFields = {
  legalRepName: z.string().trim().min(1).nullish(),
  legalRepPhone: z.string().trim().min(1).nullish(),
  legalRepPassportSeries: z.string().trim().min(1).nullish(),
  legalRepPassportNumber: z.string().trim().min(1).nullish(),
  legalRepPassportIssuedBy: z.string().trim().min(1).nullish(),
  legalRepPassportIssuedAt: z.coerce.date().nullish(),
  legalRepAddress: z.string().trim().min(1).nullish(),
};

const matCapitalFields = {
  matCapitalCoveredFrom: z.coerce.date().nullish(),
  matCapitalCoveredTo: z.coerce.date().nullish(),
  matCapitalDeferredUntil: z.coerce.date().nullish(),
};

const createContractSchema = z
  .object({
    number: z.string().trim().min(1),
    contractDate: z.coerce.date(),
    residentIndividualUid: z.string().trim().min(1),
    roomId: z.number().int(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    rentAmount: z.number().finite().nonnegative(),
    utilitiesAmount: z.number().finite().nonnegative(),
    dailyRateCategory: z.enum(['OWN_UNIVERSITY', 'OTHER_UNIVERSITY']),
    dailyRateAmount: z.number().finite().nonnegative(),
    paymentDueDay: z.number().int().min(1).max(28).default(5),
    ...legalRepFields,
    ...matCapitalFields,
  })
  .refine((data) => data.endDate >= data.startDate, { message: 'Дата окончания раньше даты начала', path: ['endDate'] });

const terminateSchema = z.object({ actualEndDate: z.coerce.date() });

function parseIdParam(idParam: string): number {
  const id = Number.parseInt(idParam, 10);
  if (!Number.isInteger(id)) {
    throw new BadRequestException('Некорректный id');
  }
  return id;
}

@Controller('contracts')
@UseGuards(AuthGuard)
export class ContractsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @Query('page') pageParam?: string,
    @Query('pageSize') pageSizeParam?: string,
    @Query('search') searchParam?: string,
    @Query('sortBy') sortByParam?: string,
    @Query('sortDir') sortDirParam?: string,
    @Query('filters') filtersParam?: string,
  ) {
    const page = Math.max(1, Number.parseInt(pageParam ?? '', 10) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(pageSizeParam ?? '', 10) || DEFAULT_PAGE_SIZE));
    const search = searchParam?.trim();
    const sortField = isSortableField(sortByParam ?? '') ? (sortByParam as SortableField) : 'startDate';
    const sortDir: Prisma.SortOrder = sortDirParam === 'desc' ? 'desc' : 'asc';

    const filterClauses: Prisma.ContractWhereInput[] = [];
    if (filtersParam) {
      try {
        const parsed: unknown = JSON.parse(filtersParam);
        if (parsed && typeof parsed === 'object') {
          for (const [field, values] of Object.entries(parsed as Record<string, unknown>)) {
            if (!isFilterableField(field) || !Array.isArray(values) || values.length === 0) {
              continue;
            }
            const stringValues = values.filter((v): v is string => typeof v === 'string');
            if (stringValues.length === 0) continue;
            filterClauses.push({ status: { in: stringValues as ContractStatus[] } });
          }
        }
      } catch {
        // Битый JSON в необязательном параметре — просто игнорируем фильтры, не 400'им весь запрос.
      }
    }

    const searchClause: Prisma.ContractWhereInput | undefined = search
      ? {
          OR: [
            { number: { contains: search, mode: 'insensitive' } },
            { resident: { fullName: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : undefined;

    const where: Prisma.ContractWhereInput | undefined =
      searchClause || filterClauses.length > 0 ? { AND: [...(searchClause ? [searchClause] : []), ...filterClauses] } : undefined;

    const orderBy: Prisma.ContractOrderByWithRelationInput =
      sortField === 'residentFullName' ? { resident: { fullName: sortDir } } : { [sortField]: sortDir };

    const [data, total] = await Promise.all([
      this.prisma.contract.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          resident: { select: { fullName: true } },
          roomAssignments: { where: { toDate: null }, include: { room: { select: { room: true } } } },
        },
      }),
      this.prisma.contract.count({ where }),
    ]);

    return {
      data: data.map((c) => ({
        id: c.id,
        number: c.number,
        status: c.status,
        startDate: c.startDate,
        endDate: c.endDate,
        actualEndDate: c.actualEndDate,
        residentFullName: c.resident.fullName,
        room: c.roomAssignments[0]?.room.room ?? null,
      })),
      total,
      page,
      pageSize,
    };
  }

  @Get('facets/:field')
  facetValues(@Param('field') field: string) {
    if (!isFilterableField(field)) {
      return [];
    }
    return Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }));
  }

  @Get(':id')
  async detail(@Param('id') idParam: string) {
    const id = parseIdParam(idParam);
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: {
        resident: { select: { fullName: true, fizicheskoyeLitsoUid: true } },
        terms: { orderBy: { validFrom: 'desc' } },
        roomAssignments: { orderBy: { fromDate: 'desc' }, include: { room: { select: { id: true, room: true } } } },
        accruals: { orderBy: { periodStart: 'asc' }, include: { allocations: true } },
        payments: { orderBy: { paidAt: 'desc' } },
      },
    });
    if (!contract) {
      throw new NotFoundException('Договор не найден');
    }

    const { terms, roomAssignments, accruals, payments, resident, ...contractFields } = contract;
    return {
      ...contractFields,
      residentFullName: resident.fullName,
      residentIndividualUid: resident.fizicheskoyeLitsoUid,
      currentRoom: roomAssignments.find((a) => a.toDate === null)?.room ?? null,
      roomHistory: roomAssignments,
      terms: terms.map(serializeTerms),
      accruals: accruals.map(serializeAccrual),
      payments: payments.map(serializePayment),
    };
  }

  @Post()
  async create(@Body() body: unknown, @Req() req: Request) {
    const parsed = createContractSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    const data = parsed.data;
    if (!req.user) {
      throw new BadRequestException('Не удалось определить пользователя сессии');
    }

    const individual = await this.prisma.individual.findUnique({ where: { fizicheskoyeLitsoUid: data.residentIndividualUid } });
    if (!individual) {
      throw new NotFoundException('Физлицо не найдено');
    }
    const room = await this.prisma.room.findUnique({ where: { id: data.roomId } });
    if (!room) {
      throw new NotFoundException('Комната не найдена');
    }

    const rentAmount = new Prisma.Decimal(data.rentAmount);
    const utilitiesAmount = new Prisma.Decimal(data.utilitiesAmount);
    const dailyRateAmount = new Prisma.Decimal(data.dailyRateAmount);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const createdByUserId = await ensureUserRecord(tx, req.user!);

        const contract = await tx.contract.create({
          data: {
            number: data.number,
            contractDate: data.contractDate,
            residentIndividualUid: data.residentIndividualUid,
            startDate: data.startDate,
            endDate: data.endDate,
            legalRepName: data.legalRepName ?? null,
            legalRepPhone: data.legalRepPhone ?? null,
            legalRepPassportSeries: data.legalRepPassportSeries ?? null,
            legalRepPassportNumber: data.legalRepPassportNumber ?? null,
            legalRepPassportIssuedBy: data.legalRepPassportIssuedBy ?? null,
            legalRepPassportIssuedAt: data.legalRepPassportIssuedAt ?? null,
            legalRepAddress: data.legalRepAddress ?? null,
            matCapitalCoveredFrom: data.matCapitalCoveredFrom ?? null,
            matCapitalCoveredTo: data.matCapitalCoveredTo ?? null,
            matCapitalDeferredUntil: data.matCapitalDeferredUntil ?? null,
            createdByUserId,
          },
        });

        const terms = await tx.contractTerms.create({
          data: {
            contractId: contract.id,
            validFrom: data.startDate,
            rentAmount,
            utilitiesAmount,
            dailyRateCategory: data.dailyRateCategory,
            dailyRateAmount,
            paymentDueDay: data.paymentDueDay,
          },
        });

        // Пересечение по датам с уже существующим заселением в эту же комнату — двух
        // активных договоров на одну комнату с перекрывающимися периодами быть не должно.
        // toDate: null — заселение ещё не закрыто (действующий договор или неотслеженный
        // EXPIRED, см. известную проблему в промпте проекта), считаем его открытым до бесконечности.
        const overlapping = await tx.roomAssignment.findFirst({
          where: {
            roomId: data.roomId,
            fromDate: { lte: data.endDate },
            OR: [{ toDate: null }, { toDate: { gte: data.startDate } }],
          },
        });
        if (overlapping) {
          throw new BadRequestException('Комната уже занята по другому договору в эти даты');
        }

        await tx.roomAssignment.create({
          data: { contractId: contract.id, roomId: data.roomId, fromDate: data.startDate },
        });

        const generated = buildAccrualsForContract({
          startDate: data.startDate,
          endDate: data.endDate,
          terms: {
            rentAmount: terms.rentAmount,
            utilitiesAmount: terms.utilitiesAmount,
            dailyRateAmount: terms.dailyRateAmount,
            paymentDueDay: terms.paymentDueDay,
          },
          matCapital: {
            coveredFrom: data.matCapitalCoveredFrom ?? null,
            coveredTo: data.matCapitalCoveredTo ?? null,
            deferredUntil: data.matCapitalDeferredUntil ?? null,
          },
        });
        if (generated.length > 0) {
          await tx.accrual.createMany({
            data: generated.map((a) => ({ contractId: contract.id, ...a })),
          });
        }

        return contract;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('Договор с таким номером уже существует');
      }
      throw error;
    }
  }

  // Досрочное расторжение. endDate договора не переписывается (исходные условия не
  // теряются) — фактическая дата выезда отдельным полем, будущие начисления гасятся
  // (voidedAt), граничное начисление пересчитывается через adjustmentAmount.
  @Post(':id/terminate')
  async terminate(@Param('id') idParam: string, @Body() body: unknown) {
    const id = parseIdParam(idParam);
    const parsed = terminateSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }

    const contract = await this.prisma.contract.findUnique({ where: { id } });
    if (!contract) {
      throw new NotFoundException('Договор не найден');
    }
    if (parsed.data.actualEndDate < contract.startDate) {
      throw new BadRequestException('Дата выезда раньше даты начала проживания');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.contract.update({
        where: { id },
        data: { status: 'TERMINATED', actualEndDate: parsed.data.actualEndDate },
      });
      await tx.roomAssignment.updateMany({
        where: { contractId: id, toDate: null },
        data: { toDate: parsed.data.actualEndDate },
      });
      await recalcAccrualsForTermination(tx, id, parsed.data.actualEndDate);
      return tx.contract.findUniqueOrThrow({ where: { id } });
    });
  }
}
