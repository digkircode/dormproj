import { Controller, Get, Param, Query } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// Текстовые поля, по которым ищем — весь "человекочитаемый" набор, кроме UID'ов
// и внутренних кодов планов 1С, которые студентам/сотрудникам ничего не скажут.
const SEARCHABLE_FIELDS = [
  'fullName',
  'zachetnayaKniga',
  'group',
  'kurs',
  'facultet',
  'speciality',
  'formObuch',
  'osnovaObuch',
  'urovenPodgotov',
  'profilSpec',
  'uchebYear',
] as const;

// Ключ — id колонки на фронте, значение — реальное поле для ORDER BY.
// "Курс" на экране текстовый ("Первый"/"Второй"...), но сортировать его надо
// по числовому kursNumber, иначе порядок будет алфавитным, а не по возрастанию курса.
const SORTABLE_FIELDS: Record<string, string> = {
  fullName: 'fullName',
  zachetnayaKniga: 'zachetnayaKniga',
  group: 'group',
  kurs: 'kursNumber',
  facultet: 'facultet',
  speciality: 'speciality',
  formObuch: 'formObuch',
  osnovaObuch: 'osnovaObuch',
  urovenPodgotov: 'urovenPodgotov',
  profilSpec: 'profilSpec',
  dot: 'dot',
  uchebYear: 'uchebYear',
};

// Поля, по которым разрешён фильтр "выбрать несколько значений" — те же, что колонки таблицы.
const FILTERABLE_FIELDS = [
  'fullName',
  'zachetnayaKniga',
  'group',
  'kurs',
  'facultet',
  'speciality',
  'formObuch',
  'osnovaObuch',
  'urovenPodgotov',
  'profilSpec',
  'dot',
  'uchebYear',
] as const;
type FilterableField = (typeof FILTERABLE_FIELDS)[number];

function isFilterableField(field: string): field is FilterableField {
  return (FILTERABLE_FIELDS as readonly string[]).includes(field);
}

@Controller('students')
export class StudentsController {
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

    const filterClauses: Prisma.StudentWhereInput[] = [];
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
            if (field === 'dot') {
              // Prisma's BoolFilter has no `in` — with only two possible values,
              // picking both means "no filter", picking one is a plain equality check.
              const boolValues = [...new Set(stringValues.map((v) => v === 'true'))];
              if (boolValues.length === 1) {
                filterClauses.push({ dot: boolValues[0] });
              }
            } else {
              filterClauses.push({ [field]: { in: stringValues } });
            }
          }
        }
      } catch {
        // Битый JSON в необязательном параметре — просто игнорируем фильтры, не 400'им весь запрос.
      }
    }

    const searchClause: Prisma.StudentWhereInput | undefined = search
      ? { OR: SEARCHABLE_FIELDS.map((field) => ({ [field]: { contains: search, mode: 'insensitive' } })) }
      : undefined;

    const where: Prisma.StudentWhereInput | undefined =
      searchClause || filterClauses.length > 0 ? { AND: [...(searchClause ? [searchClause] : []), ...filterClauses] } : undefined;

    const [data, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        orderBy: { [sortField]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.student.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  @Get('facets/:field')
  async facetValues(@Param('field') field: string) {
    if (!isFilterableField(field)) {
      return [];
    }

    if (field === 'dot') {
      return [
        { value: 'true', label: 'Да' },
        { value: 'false', label: 'Нет' },
      ];
    }

    if (field === 'kurs') {
      // "Курс" — текст ("Первый"/"Второй"...), список значений нужен в естественном
      // порядке (по kursNumber), а не в алфавитном ("Второй" раньше "Первого").
      const rows = await this.prisma.student.findMany({
        where: { kurs: { notIn: [''] } },
        select: { kurs: true, kursNumber: true },
        distinct: ['kursNumber', 'kurs'],
        orderBy: [{ kursNumber: 'asc' }, { kurs: 'asc' }],
        take: 500,
      });
      return rows.map((row) => ({ value: row.kurs, label: row.kurs }));
    }

    const rows = await this.prisma.student.findMany({
      where: { [field]: { notIn: [''] } },
      select: { [field]: true },
      distinct: [field as keyof Prisma.StudentSelect],
      orderBy: { [field]: 'asc' },
      take: 500,
    });

    return rows.map((row) => {
      const value = (row as Record<string, string>)[field];
      return { value, label: value };
    });
  }
}
