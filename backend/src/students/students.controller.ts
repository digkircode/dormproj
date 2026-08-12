import { Controller, Get, Query } from '@nestjs/common';
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
  ) {
    const page = Math.max(1, Number.parseInt(pageParam ?? '', 10) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(pageSizeParam ?? '', 10) || DEFAULT_PAGE_SIZE));
    const search = searchParam?.trim();
    const sortField = SORTABLE_FIELDS[sortByParam ?? ''] ?? 'fullName';
    const sortDir: Prisma.SortOrder = sortDirParam === 'desc' ? 'desc' : 'asc';

    const where: Prisma.StudentWhereInput | undefined = search
      ? {
          OR: SEARCHABLE_FIELDS.map((field) => ({ [field]: { contains: search, mode: 'insensitive' } })),
        }
      : undefined;

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
}
