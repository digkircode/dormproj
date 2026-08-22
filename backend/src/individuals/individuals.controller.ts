import { BadRequestException, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, Post, Body, Query, UseGuards } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { sortPassportsByPriority } from './passport-priority';
import { pickLatestContactInfo } from './contact-info-priority';
import { IndividualSyncService, type IndividualSyncResult } from '../individual-sync/individual-sync.service';
import { SyncAlreadyRunningError } from '../sync/sync.errors';

// Форма "Новое физическое лицо" (Individuals.vue) — заводит физлицо руками, не через
// синхрон 1С. Детерминированного uid тут нет (в отличие от manual-parent-* в
// contracts.controller.ts, где он один на резидента) — просто случайный per вызов.
const createIndividualSchema = z.object({
  surname: z.string().trim().min(1),
  name: z.string().trim().min(1),
  otchestvo: z.string().trim().min(1).nullish(),
  birthDate: z.coerce.date(),
  phone: z.string().trim().min(1),
  email: z.string().trim().email().nullish(),
  address: z.string().trim().min(1),
  snils: z.string().trim().min(1).nullish(),
  inn: z.string().trim().min(1).nullish(),
  passportSeries: z.string().trim().min(1).nullish(),
  passportNumber: z.string().trim().min(1),
  passportIssuedBy: z.string().trim().min(1).nullish(),
  passportIssuedCode: z.string().trim().min(1).nullish(),
  passportIssuedAt: z.coerce.date(),
});

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// birthDateText — сгенерированная БД колонка (DD.MM.YYYY от birth_date), чтобы дату
// рождения можно было искать тем же ILIKE, что и обычный текст (см. schema.prisma).
const SEARCHABLE_FIELDS = ['fullName', 'code', 'snils', 'inn', 'gender', 'birthDateText', 'fizicheskoyeLitsoUid'] as const;

const SORTABLE_FIELDS: Record<string, string> = {
  fullName: 'fullName',
  code: 'code',
  snils: 'snils',
  birthDate: 'birthDate',
  inn: 'inn',
  gender: 'gender',
};

// Только пол — практичное поле для мультивыбора (пара значений); ФИО/код/СНИЛС/ИНН
// почти уникальны на строку, дата рождения для чипов-фильтров неудобна.
const FILTERABLE_FIELDS = ['gender'] as const;
type FilterableField = (typeof FILTERABLE_FIELDS)[number];

function isFilterableField(field: string): field is FilterableField {
  return (FILTERABLE_FIELDS as readonly string[]).includes(field);
}

@Controller('individuals')
@UseGuards(AuthGuard, RolesGuard)
@Roles('STAFF', 'ADMIN')
export class IndividualsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly individualSyncService: IndividualSyncService,
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
    const sortField = SORTABLE_FIELDS[sortByParam ?? ''] ?? 'fullName';
    const sortDir: Prisma.SortOrder = sortDirParam === 'desc' ? 'desc' : 'asc';

    const filterClauses: Prisma.IndividualWhereInput[] = [];
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
            filterClauses.push({ [field]: { in: stringValues } });
          }
        }
      } catch {
        // Битый JSON в необязательном параметре — просто игнорируем фильтры, не 400'им весь запрос.
      }
    }

    const searchClause: Prisma.IndividualWhereInput | undefined = search
      ? { OR: SEARCHABLE_FIELDS.map((field) => ({ [field]: { contains: search, mode: 'insensitive' } })) }
      : undefined;

    const where: Prisma.IndividualWhereInput | undefined =
      searchClause || filterClauses.length > 0 ? { AND: [...(searchClause ? [searchClause] : []), ...filterClauses] } : undefined;

    const [data, total] = await Promise.all([
      this.prisma.individual.findMany({
        where,
        orderBy: { [sortField]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.individual.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  @Post()
  async create(@Body() body: unknown) {
    const parsed = createIndividualSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    const data = parsed.data;
    const fullName = [data.surname, data.name, data.otchestvo].filter(Boolean).join(' ');

    return this.prisma.individual.create({
      data: {
        fizicheskoyeLitsoUid: `manual-${randomUUID()}`,
        isManual: true,
        fullName,
        surname: data.surname,
        name: data.name,
        otchestvo: data.otchestvo ?? null,
        birthDate: data.birthDate,
        phone: data.phone,
        email: data.email ?? null,
        address: data.address,
        snils: data.snils ?? null,
        inn: data.inn ?? null,
        passportSeries: data.passportSeries ?? null,
        passportNumber: data.passportNumber,
        passportIssuedBy: data.passportIssuedBy ?? null,
        passportIssuedCode: data.passportIssuedCode ?? null,
        passportIssuedAt: data.passportIssuedAt,
      },
    });
  }

  @Get('facets/:field')
  async facetValues(@Param('field') field: string) {
    if (!isFilterableField(field)) {
      return [];
    }

    const rows = await this.prisma.individual.findMany({
      where: { [field]: { notIn: [''] } },
      select: { [field]: true },
      distinct: [field as unknown as Prisma.IndividualScalarFieldEnum],
      orderBy: { [field]: 'asc' },
      take: 500,
    });

    return rows.map((row) => {
      const value = (row as unknown as Record<string, string>)[field];
      return { value, label: value };
    });
  }

  // Гражданство — только последнее по period (take: 1). Паспорта — все, пересортированные
  // в приложении через sortPassportsByPriority: тип документа важнее даты (паспорт РФ,
  // выданный раньше, всё равно актуальнее военного билета, полученного позже) — Prisma
  // не умеет сортировать по произвольному приоритету значений напрямую в orderBy.
  // Контактная информация — тем же способом схлопывается до одной записи на Type,
  // см. pickLatestContactInfo (там же — почему это эвристика, а не чистка данных).
  // Student не имеет Prisma-связи с Individual (только совпадающий fizicheskoyeLitsoUid,
  // см. schema.prisma) — берём отдельным запросом, а не через include.
  @Get(':uid')
  async detail(@Param('uid') uid: string) {
    const [individual, students] = await Promise.all([
      this.prisma.individual.findUnique({
        where: { fizicheskoyeLitsoUid: uid },
        include: {
          citizenships: { orderBy: { period: 'desc' }, take: 1 },
          passports: true,
          contactInfos: true,
        },
      }),
      this.prisma.student.findMany({
        where: { fizicheskoyeLitsoUid: uid },
        orderBy: { period: 'desc' },
      }),
    ]);

    if (!individual) {
      throw new NotFoundException('Физлицо не найдено');
    }

    return {
      ...individual,
      passports: sortPassportsByPriority(individual.passports),
      contactInfos: pickLatestContactInfo(individual.contactInfos),
      students,
    };
  }

  // Кнопка "Синхронизировать" на карточке физлица — единственный способ запустить
  // этот синхрон (см. IndividualSyncController: там только логи, без POST).
  @Post(':uid/sync')
  @HttpCode(200)
  async sync(@Param('uid') uid: string): Promise<IndividualSyncResult> {
    try {
      return await this.individualSyncService.runSyncForIndividual(uid);
    } catch (error) {
      if (error instanceof SyncAlreadyRunningError) {
        throw new ConflictException('Синхронизация физлица уже выполняется, дождитесь её завершения');
      }
      throw error;
    }
  }
}
