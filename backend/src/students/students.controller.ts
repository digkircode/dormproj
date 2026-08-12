import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Controller('students')
export class StudentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query('page') pageParam?: string, @Query('pageSize') pageSizeParam?: string) {
    const page = Math.max(1, Number.parseInt(pageParam ?? '', 10) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(pageSizeParam ?? '', 10) || DEFAULT_PAGE_SIZE));

    const [data, total] = await Promise.all([
      this.prisma.student.findMany({
        orderBy: { fullName: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.student.count(),
    ]);

    return { data, total, page, pageSize };
  }
}
