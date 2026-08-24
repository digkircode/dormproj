import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ensureUserRecord } from '../users/ensure-user';
import { AuditLogService } from '../audit-log/audit-log.service';
import { buildAccrualsForContract } from '../billing/accrual-generation';
import { recalcAccrualsForTermination } from '../billing/termination';
import { computePenaltyBalance } from '../billing/penalty-balance';
import { dateOnly } from '../billing/period-utils';
import { serializeAccrual, serializePayment, serializeTerms } from './serializers';
import { isMinorAt } from './minor';
import { buildResidentSnapshot, fillManualFallbacks, type ResidentSnapshot } from './resident-snapshot';
import { renderContractDocument } from './contract-document';
import { buildDocumentData } from './contract-document-data';
import { EXPIRING_WINDOW_DAYS, CONTRACT_DISPLAY_STATUS_LABELS, type ContractDisplayStatus } from './contract-display-status';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// residentFullName — через связь resident, room намеренно не сортируем (текущая комната —
// производная от roomAssignments, не прямая колонка, как и в остальных списках проекта не
// всё отображаемое обязано быть сортируемым, см. passport.controller.ts).
const SORTABLE_FIELDS = ['number', 'contractDate', 'residentFullName', 'startDate', 'endDate', 'status'] as const;
type SortableField = (typeof SORTABLE_FIELDS)[number];
function isSortableField(field: string): field is SortableField {
  return (SORTABLE_FIELDS as readonly string[]).includes(field);
}

const FILTERABLE_FIELDS = ['status'] as const;
type FilterableField = (typeof FILTERABLE_FIELDS)[number];
function isFilterableField(field: string): field is FilterableField {
  return (FILTERABLE_FIELDS as readonly string[]).includes(field);
}

// Опции фильтра/facets — включают вычисляемый бакет EXPIRING (не реальный ContractStatus
// в БД, см. contract-display-status.ts), поэтому это НЕ то же самое, что просто ключи
// ContractStatus enum. Порядок — тот же, что и в выпадающем списке фильтра на фронте
// (contracts-format.ts#STATUS_LABELS): "Истекает" сразу после "Действует".
const STATUS_FACET_LABELS: Record<ContractDisplayStatus, string> = CONTRACT_DISPLAY_STATUS_LABELS;

const legalRepFields = {
  legalRepName: z.string().trim().min(1).nullish(),
  legalRepPhone: z.string().trim().min(1).nullish(),
  legalRepGender: z.enum(['Мужской', 'Женский']).nullish(),
  legalRepBirthDate: z.coerce.date().nullish(),
  legalRepPassportSeries: z.string().trim().min(1).nullish(),
  legalRepPassportNumber: z.string().trim().min(1).nullish(),
  legalRepPassportIssuedBy: z.string().trim().min(1).nullish(),
  legalRepPassportIssuedCode: z.string().trim().min(1).nullish(),
  legalRepPassportIssuedAt: z.coerce.date().nullish(),
  legalRepSnils: z.string().trim().min(1).nullish(),
  legalRepInn: z.string().trim().min(1).nullish(),
  legalRepAddress: z.string().trim().min(1).nullish(),
};

const matCapitalFields = {
  matCapitalCoveredFrom: z.coerce.date().nullish(),
  matCapitalCoveredTo: z.coerce.date().nullish(),
  matCapitalAmount: z.number().finite().nonnegative().nullish(),
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
    residenceReason: z.string().trim().min(1).nullish(),
    paymentDueDay: z.number().int().min(1).max(28).default(5),
    ...legalRepFields,
    ...matCapitalFields,
  })
  .refine((data) => data.endDate >= data.startDate, { message: 'Дата окончания раньше даты начала', path: ['endDate'] });

const terminateSchema = z.object({ actualEndDate: z.coerce.date() });

// Поля, участвующие в diff'е истории изменений (AuditLogService) — residentSnapshot (JSON-
// слепок) и penaltyAccruedThrough (служебное, для идемпотентности крона) намеренно не
// отслеживаются, слишком шумно/не осмысленно для diff'а.
const AUDITED_CONTRACT_FIELDS = [
  'number',
  'contractDate',
  'residentIndividualUid',
  'startDate',
  'endDate',
  'actualEndDate',
  'status',
  'residenceReason',
  'legalRepName',
  'legalRepPhone',
  'legalRepGender',
  'legalRepBirthDate',
  'legalRepPassportSeries',
  'legalRepPassportNumber',
  'legalRepPassportIssuedBy',
  'legalRepPassportIssuedCode',
  'legalRepPassportIssuedAt',
  'legalRepSnils',
  'legalRepInn',
  'legalRepAddress',
  'matCapitalCoveredFrom',
  'matCapitalCoveredTo',
  'matCapitalAmount',
  'matCapitalDeferredUntil',
];

// Разводит "Действует" и "Истекает" в SQL, а не только в отображении (по прямой
// просьбе — раньше фильтр "Действует" включал в себя и те договоры, что в самой
// строке таблицы уже показывались как "Истекает", см. ContractStatusCell.vue). EXPIRING
// не хранится в БД — это тот же вычисляемый бакет (ACTIVE + endDate в ближайшие
// EXPIRING_WINDOW_DAYS дней), что и на фронте (contract-display-status.ts), просто
// выраженный здесь через WHERE, а не через JS-функцию после выборки.
function buildStatusFilterClause(values: string[]): Prisma.ContractWhereInput | undefined {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + EXPIRING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const clauses: Prisma.ContractWhereInput[] = [];
  for (const value of values) {
    if (value === 'EXPIRING') {
      clauses.push({ status: 'ACTIVE', endDate: { gte: now, lte: windowEnd } });
    } else if (value === 'ACTIVE') {
      clauses.push({ status: 'ACTIVE', NOT: { endDate: { gte: now, lte: windowEnd } } });
    } else if (value === 'TERMINATED' || value === 'EXPIRED') {
      clauses.push({ status: value });
    }
  }
  return clauses.length > 0 ? { OR: clauses } : undefined;
}

function parseIdParam(idParam: string): number {
  const id = Number.parseInt(idParam, 10);
  if (!Number.isInteger(id)) {
    throw new BadRequestException('Некорректный id');
  }
  return id;
}

@Controller('contracts')
@UseGuards(AuthGuard, RolesGuard)
@Roles('STAFF', 'ADMIN')
export class ContractsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

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
            const statusClause = buildStatusFilterClause(stringValues);
            if (statusClause) filterClauses.push(statusClause);
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
          roomAssignments: { where: { toDate: null }, include: { room: { select: { id: true, room: true } } } },
        },
      }),
      this.prisma.contract.count({ where }),
    ]);

    return {
      data: data.map((c) => ({
        id: c.id,
        number: c.number,
        contractDate: c.contractDate,
        status: c.status,
        startDate: c.startDate,
        endDate: c.endDate,
        actualEndDate: c.actualEndDate,
        residentFullName: c.resident.fullName,
        room: c.roomAssignments[0]?.room.room ?? null,
        roomId: c.roomAssignments[0]?.room.id ?? null,
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
    return Object.entries(STATUS_FACET_LABELS).map(([value, label]) => ({ value, label }));
  }

  // Автоподстановка родителя на новом договоре того же несовершеннолетнего — последний
  // договор этого резидента, где уже заводился Individual(isManual) для родителя (см.
  // create() ниже). Печатные данные конкретного договора берутся из legalRep*-полей самого
  // НАЙДЕННОГО договора (не из Individual) — та же логика, что и при печати.
  @Get('legal-rep/:residentUid')
  async legalRepPrefill(@Param('residentUid') residentUid: string) {
    const previous = await this.prisma.contract.findFirst({
      where: { residentIndividualUid: residentUid, legalRepIndividualUid: { not: null } },
      orderBy: { contractDate: 'desc' },
    });
    if (!previous) return null;
    return {
      legalRepName: previous.legalRepName,
      legalRepPhone: previous.legalRepPhone,
      legalRepGender: previous.legalRepGender,
      legalRepBirthDate: previous.legalRepBirthDate,
      legalRepPassportSeries: previous.legalRepPassportSeries,
      legalRepPassportNumber: previous.legalRepPassportNumber,
      legalRepPassportIssuedBy: previous.legalRepPassportIssuedBy,
      legalRepPassportIssuedCode: previous.legalRepPassportIssuedCode,
      legalRepPassportIssuedAt: previous.legalRepPassportIssuedAt,
      legalRepSnils: previous.legalRepSnils,
      legalRepInn: previous.legalRepInn,
      legalRepAddress: previous.legalRepAddress,
    };
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
        accruals: {
          orderBy: { periodStart: 'asc' },
          include: { allocations: { include: { payment: { select: { paidAt: true, reversedAt: true } } } } },
        },
        payments: { orderBy: { paidAt: 'desc' } },
        penaltyLogs: true,
      },
    });
    if (!contract) {
      throw new NotFoundException('Договор не найден');
    }

    const { terms, roomAssignments, accruals, payments, penaltyLogs, resident, matCapitalAmount, ...contractFields } = contract;
    // Пеня — производная от журнала (не хранимое поле, см. schema.prisma), сколько из неё
    // уже покрыто платежами — тоже выводим на чтении (см. penalty-balance.ts). "На сейчас",
    // а не на дату — карточка договора не поддерживает выбор даты (в отличие от финансового
    // отчёта, где asOf выбирается пользователем).
    const { penaltyAmount, penaltyPaid, penaltyBalance } = computePenaltyBalance({
      asOf: dateOnly(new Date()),
      penaltyLogs,
      accruals,
      payments,
    });
    return {
      ...contractFields,
      // Decimal не сериализуется в JSON как обычное число сам по себе — тот же приём, что
      // и в serializeTerms/serializeAccrual, явный Number(...) вместо спреда как есть.
      matCapitalAmount: matCapitalAmount !== null ? Number(matCapitalAmount) : null,
      penaltyAmount: Number(penaltyAmount),
      penaltyPaid: Number(penaltyPaid),
      penaltyBalance: Number(penaltyBalance),
      residentFullName: resident.fullName,
      residentIndividualUid: resident.fizicheskoyeLitsoUid,
      currentRoom: roomAssignments.find((a) => a.toDate === null)?.room ?? null,
      roomHistory: roomAssignments,
      terms: terms.map(serializeTerms),
      accruals: accruals.map(serializeAccrual),
      payments: payments.map(serializePayment),
      // Определяет, доступно ли "Удалить договор" в UI — после первой же оплаты (даже
      // сторнированной) удаление блокируется навсегда, см. remove() ниже.
      hasPayments: payments.length > 0,
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

    // Комната без обеих месячных характеристик "Стоимость (из/не из вуза)" — целиком
    // посуточная (112-2/410-2 на момент введения, см. миграцию room_price_by_university_category
    // и billing/accrual-generation.ts). Признак специально не хардкодится по id/номеру комнаты —
    // источник истины остаётся в EAV-характеристиках, как и остальная модель комнат.
    const roomPriceCharacteristic = await this.prisma.roomCharacteristicValue.findFirst({
      where: { roomId: data.roomId, definition: { name: { in: ['Стоимость (из вуза)', 'Стоимость (не из вуза)'] } } },
      select: { id: true },
    });
    const isDailyOnlyRoom = !roomPriceCharacteristic;

    // Несовершеннолетие — на дату ДОГОВОРА (contractDate), как и во фронтовом computed
    // isMinor (Contracts.vue). Раньше здесь не было никакой серверной проверки блока
    // родителя вообще (см. известную проблему в промпте проекта) — прямой запрос мимо
    // формы мог завести договор на несовершеннолетнего без данных родителя.
    const contractIsMinor = isMinorAt(individual.birthDate, data.contractDate);
    if (contractIsMinor) {
      if (!data.legalRepBirthDate || !data.legalRepPassportNumber || !data.legalRepPassportIssuedAt) {
        throw new BadRequestException('Для несовершеннолетнего обязательны дата рождения, номер и дата выдачи паспорта родителя');
      }
    }

    // Причина проживания печатается в п.1.2 бланка вместо "обучением в АНО ВО «РосНОУ»" —
    // обязательна только для тех, кто не из своего вуза (см. contract-document-data.ts).
    if (data.dailyRateCategory === 'OTHER_UNIVERSITY' && !data.residenceReason) {
      throw new BadRequestException('Укажите причину проживания');
    }

    // Посуточная комната — месячной ставки нет вообще, игнорируем rentAmount/utilitiesAmount
    // из запроса (форма их для такой комнаты и не показывает), чтобы в ContractTerms/печати/
    // отчётах не осел случайный "остаточный" месячный номер.
    const rentAmount = isDailyOnlyRoom ? new Prisma.Decimal(0) : new Prisma.Decimal(data.rentAmount);
    const utilitiesAmount = isDailyOnlyRoom ? new Prisma.Decimal(0) : new Prisma.Decimal(data.utilitiesAmount);
    const dailyRateAmount = new Prisma.Decimal(data.dailyRateAmount);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const createdByUserId = await ensureUserRecord(tx, req.user!);

        // Снимок личных данных проживающего на момент подписания — печать договора
        // всегда будет показывать именно это, даже если синхрон 1С перепишет паспорт/
        // СНИЛС/адрес/телефон позже (см. resident-snapshot.ts).
        const residentSnapshot = await buildResidentSnapshot(tx, data.residentIndividualUid);

        const contract = await tx.contract.create({
          data: {
            number: data.number,
            contractDate: data.contractDate,
            residentIndividualUid: data.residentIndividualUid,
            startDate: data.startDate,
            endDate: data.endDate,
            residentSnapshot: residentSnapshot as unknown as Prisma.InputJsonValue,
            residenceReason: data.residenceReason ?? null,
            legalRepName: data.legalRepName ?? null,
            legalRepPhone: data.legalRepPhone ?? null,
            legalRepGender: data.legalRepGender ?? null,
            legalRepBirthDate: data.legalRepBirthDate ?? null,
            legalRepPassportSeries: data.legalRepPassportSeries ?? null,
            legalRepPassportNumber: data.legalRepPassportNumber ?? null,
            legalRepPassportIssuedBy: data.legalRepPassportIssuedBy ?? null,
            legalRepPassportIssuedCode: data.legalRepPassportIssuedCode ?? null,
            legalRepPassportIssuedAt: data.legalRepPassportIssuedAt ?? null,
            legalRepSnils: data.legalRepSnils ?? null,
            legalRepInn: data.legalRepInn ?? null,
            legalRepAddress: data.legalRepAddress ?? null,
            matCapitalCoveredFrom: data.matCapitalCoveredFrom ?? null,
            matCapitalCoveredTo: data.matCapitalCoveredTo ?? null,
            matCapitalAmount: data.matCapitalAmount != null ? new Prisma.Decimal(data.matCapitalAmount) : null,
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
          dailyOnly: isDailyOnlyRoom,
        });
        if (generated.length > 0) {
          await tx.accrual.createMany({
            data: generated.map((a) => ({ contractId: contract.id, ...a })),
          });
        }

        // Родитель несовершеннолетнего — заводится как настоящий Individual(isManual=true),
        // не только текстовыми legalRep*-полями на Contract (см. schema.prisma — это
        // сознательный пересмотр прежнего решения, по прямой просьбе). uid детерминированный
        // (один на резидента) — повторный договор того же несовершеннолетнего обновляет ту
        // же запись, а не плодит дубли; печатные данные конкретно ЭТОГО договора всё равно
        // берутся из legalRep*-полей выше, эта запись только для будущей автоподстановки.
        if (contractIsMinor && data.legalRepName) {
          const legalRepUid = `manual-parent-${data.residentIndividualUid}`;
          // Телефон/адрес/паспорт родителя (2026-08-22) — те же поля ручного ввода, что и у
          // формы "Новое физическое лицо" (см. schema.prisma), тем же upsert'ом, что и
          // остальные поля выше. Contract.legalRep* при этом не трогаем — они остаются
          // неизменным снимком на момент подписания для печати бланка (см. промпт проекта),
          // это чисто аддитивно обогащает связанную запись Individual для будущей пользы
          // (поиск/карточка), риска для печати нет.
          const legalRepIndividualData = {
            fullName: data.legalRepName,
            gender: data.legalRepGender ?? null,
            birthDate: data.legalRepBirthDate ?? null,
            snils: data.legalRepSnils ?? null,
            inn: data.legalRepInn ?? null,
            phone: data.legalRepPhone ?? null,
            address: data.legalRepAddress ?? null,
            passportSeries: data.legalRepPassportSeries ?? null,
            passportNumber: data.legalRepPassportNumber ?? null,
            passportIssuedBy: data.legalRepPassportIssuedBy ?? null,
            passportIssuedCode: data.legalRepPassportIssuedCode ?? null,
            passportIssuedAt: data.legalRepPassportIssuedAt ?? null,
          };
          await tx.individual.upsert({
            where: { fizicheskoyeLitsoUid: legalRepUid },
            create: { fizicheskoyeLitsoUid: legalRepUid, isManual: true, ...legalRepIndividualData },
            update: legalRepIndividualData,
          });
        }

        const finalContract = contractIsMinor && data.legalRepName
          ? await tx.contract.update({
              where: { id: contract.id },
              data: { legalRepIndividualUid: `manual-parent-${data.residentIndividualUid}` },
            })
          : contract;

        await this.auditLog.log(tx, {
          userId: createdByUserId,
          action: 'CREATE',
          entityType: 'Contract',
          entityId: finalContract.id,
          entityLabel: finalContract.number,
          before: null,
          after: finalContract,
          fields: AUDITED_CONTRACT_FIELDS,
        });

        return finalContract;
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
  async terminate(@Param('id') idParam: string, @Body() body: unknown, @Req() req: Request) {
    const id = parseIdParam(idParam);
    const parsed = terminateSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    if (!req.user) {
      throw new BadRequestException('Не удалось определить пользователя сессии');
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
      const updated = await tx.contract.findUniqueOrThrow({ where: { id } });

      const userId = await ensureUserRecord(tx, req.user!);
      await this.auditLog.log(tx, {
        userId,
        action: 'UPDATE',
        entityType: 'Contract',
        entityId: updated.id,
        entityLabel: updated.number,
        before: contract,
        after: updated,
        fields: AUDITED_CONTRACT_FIELDS,
      });

      return updated;
    });
  }

  // Полное удаление договора со всеми связками (ContractTerms/RoomAssignment/Accrual —
  // onDelete: Cascade в schema.prisma) — но ТОЛЬКО пока по нему не было ни одной оплаты
  // (даже сторнированной, reversedAt не разбираем — раз платёж был, назад дороги нет).
  // matchedContractId у PaymentImportRecord обнуляем на всякий случай — таблица пока
  // пустая на практике (нет сервиса импорта), но если когда-то появится, FK не должен
  // блокировать удаление осиротевшей ссылки.
  @Delete(':id')
  async remove(@Param('id') idParam: string, @Req() req: Request) {
    const id = parseIdParam(idParam);
    if (!req.user) {
      throw new BadRequestException('Не удалось определить пользователя сессии');
    }
    const contract = await this.prisma.contract.findUnique({ where: { id } });
    if (!contract) {
      throw new NotFoundException('Договор не найден');
    }
    const paymentsCount = await this.prisma.payment.count({ where: { contractId: id } });
    if (paymentsCount > 0) {
      throw new BadRequestException('По договору уже проводились оплаты — удаление недоступно');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.paymentImportRecord.updateMany({ where: { matchedContractId: id }, data: { matchedContractId: null } });
      await tx.contract.delete({ where: { id } });

      const userId = await ensureUserRecord(tx, req.user!);
      await this.auditLog.log(tx, {
        userId,
        action: 'DELETE',
        entityType: 'Contract',
        entityId: id,
        entityLabel: contract.number,
        before: contract,
        after: null,
        fields: AUDITED_CONTRACT_FIELDS,
      });
    });
    return { ok: true };
  }

  // Печать договора — заполняет один из двух реальных бланков (обычный/для
  // несовершеннолетних, выбор по наличию legalRepIndividualUid) данными на момент
  // подписания. Для договоров, созданных до этой фичи (residentSnapshot ещё пуст) —
  // best-effort снимок из ТЕКУЩИХ данных физлица строится один раз здесь же и сохраняется,
  // дальше уже не пересчитывается (см. resident-snapshot.ts).
  @Get(':id/document')
  async document(@Param('id') idParam: string, @Res() res: Response) {
    const id = parseIdParam(idParam);
    let contract = await this.prisma.contract.findUnique({
      where: { id },
      include: { terms: { orderBy: { validFrom: 'asc' }, take: 1 }, roomAssignments: { orderBy: { fromDate: 'asc' }, take: 1, include: { room: true } } },
    });
    if (!contract) {
      throw new NotFoundException('Договор не найден');
    }

    if (!contract.residentSnapshot) {
      const snapshot = await buildResidentSnapshot(this.prisma, contract.residentIndividualUid);
      await this.prisma.contract.update({
        where: { id },
        data: { residentSnapshot: snapshot as unknown as Prisma.InputJsonValue },
      });
      contract = { ...contract, residentSnapshot: snapshot as unknown as Prisma.JsonValue };
    }

    // Снимок мог быть сохранён ДО фикса isManual-фолбэка (2026-08-23) — телефон/адрес/
    // паспорт в нём тогда пустые, хотя у физлица они введены вручную. Снимок целиком не
    // пересобираем (не должен "плыть" от текущих данных), но именно эти пустые поля
    // дозаполняем текущими значениями Individual при каждой печати, см. fillManualFallbacks.
    const individualForFallback = await this.prisma.individual.findUnique({
      where: { fizicheskoyeLitsoUid: contract.residentIndividualUid },
      select: { phone: true, address: true, passportSeries: true, passportNumber: true, passportIssuedBy: true, passportIssuedCode: true, passportIssuedAt: true },
    });
    const resident = fillManualFallbacks(contract.residentSnapshot as unknown as ResidentSnapshot, individualForFallback ?? {
      phone: null, address: null, passportSeries: null, passportNumber: null, passportIssuedBy: null, passportIssuedCode: null, passportIssuedAt: null,
    });
    const terms = contract.terms[0];
    const room = contract.roomAssignments[0]?.room ?? null;
    const isMinorContract = contract.legalRepIndividualUid !== null;
    const dormitoryInfo = await this.prisma.dormitoryInfo.findUnique({ where: { id: 1 } });

    const buffer = renderContractDocument(
      isMinorContract ? 'minor' : 'standard',
      buildDocumentData(contract, resident, terms, room, dormitoryInfo?.communalServicesCost ?? null),
    );

    // Content-Disposition — только Latin1/ASCII в filename=, иначе Node бросает
    // ERR_INVALID_CHAR (номер договора может содержать кириллицу/что угодно) —
    // ASCII-заглушка в filename= + правильно закодированное имя в filename* (RFC 5987/6266).
    const asciiFallback = `contract-${contract.number}.docx`.replace(/[^\x20-\x7E]/g, '_');
    const utf8Name = encodeURIComponent(`Договор № ${contract.number}.docx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${asciiFallback}"; filename*=UTF-8''${utf8Name}`);
    res.send(buffer);
  }
}
