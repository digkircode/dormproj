import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { sortPassportsByPriority } from './passport-priority';
import { pickLatestContactInfo } from './contact-info-priority';

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
@UseGuards(AuthGuard)
export class IndividualsController {
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
}
