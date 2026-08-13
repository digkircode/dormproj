import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// fullName живёт в Individual, а не в ContactInfo (см. schema.prisma) — ищем и сортируем
// по нему через связь individual. xml/json намеренно не участвуют ни в поиске, ни в
// сортировке — это сырые дубли остальных полей, огромные и бесполезные для ILIKE/ORDER BY.
const DIRECT_SEARCHABLE_FIELDS = [
  'type',
  'predstavleniye',
  'country',
  'region',
  'city',
  'email',
  'phoneNumber',
  'phoneNumberNoCode',
  'dateStartText',
  'fizicheskoyeLitsoUid',
] as const;

const SORTABLE_FIELDS = [
  'fullName',
  'type',
  'predstavleniye',
  'country',
  'region',
  'city',
  'email',
  'phoneNumber',
  'phoneNumberNoCode',
  'dateStart',
] as const;
type SortableField = (typeof SORTABLE_FIELDS)[number];

function isSortableField(field: string): field is SortableField {
  return (SORTABLE_FIELDS as readonly string[]).includes(field);
}

// Тип/страна/регион/город — ограниченные по факту наборы значений, удобные для
// мультивыбора. Представление/email/телефон/XML/JSON почти уникальны на строку.
const FILTERABLE_FIELDS = ['type', 'country', 'region', 'city'] as const;
type FilterableField = (typeof FILTERABLE_FIELDS)[number];

function isFilterableField(field: string): field is FilterableField {
  return (FILTERABLE_FIELDS as readonly string[]).includes(field);
}

@Controller('contact-info')
@UseGuards(AuthGuard)
export class ContactInfoController {
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
    const sortField = isSortableField(sortByParam ?? '') ? (sortByParam as SortableField) : 'fullName';
    const sortDir: Prisma.SortOrder = sortDirParam === 'desc' ? 'desc' : 'asc';

    const filterClauses: Prisma.ContactInfoWhereInput[] = [];
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

    const searchClause: Prisma.ContactInfoWhereInput | undefined = search
      ? {
          OR: [
            ...DIRECT_SEARCHABLE_FIELDS.map((field) => ({ [field]: { contains: search, mode: 'insensitive' as const } })),
            { individual: { fullName: { contains: search, mode: 'insensitive' as const } } },
          ],
        }
      : undefined;

    const where: Prisma.ContactInfoWhereInput | undefined =
      searchClause || filterClauses.length > 0 ? { AND: [...(searchClause ? [searchClause] : []), ...filterClauses] } : undefined;

    const orderBy: Prisma.ContactInfoOrderByWithRelationInput =
      sortField === 'fullName' ? { individual: { fullName: sortDir } } : { [sortField]: sortDir };

    const [rows, total] = await Promise.all([
      this.prisma.contactInfo.findMany({
        where,
        include: { individual: { select: { fullName: true } } },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.contactInfo.count({ where }),
    ]);

    const data = rows.map(({ individual, ...row }) => ({ ...row, fullName: individual.fullName }));

    return { data, total, page, pageSize };
  }

  @Get('facets/:field')
  async facetValues(@Param('field') field: string) {
    if (!isFilterableField(field)) {
      return [];
    }

    const rows = await this.prisma.contactInfo.findMany({
      where: { [field]: { notIn: [''] } },
      select: { [field]: true },
      distinct: [field as unknown as Prisma.ContactInfoScalarFieldEnum],
      orderBy: { [field]: 'asc' },
      take: 500,
    });

    return rows.map((row) => {
      const value = (row as unknown as Record<string, string>)[field];
      return { value, label: value };
    });
  }
}
