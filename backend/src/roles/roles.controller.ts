import { BadRequestException, Body, ConflictException, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';

const createRoleSchema = z.object({ name: z.string().trim().min(1).max(50) });

// Справочник ролей — только ADMIN. Создание новой роли тут не даёт ей автоматически
// никаких прав — @Roles()/RolesGuard по коду проверяют конкретные строковые ключи
// ('ADMIN'/'STAFF'/'RESIDENT'), новое имя роли просто ляжет в таблицу без единой
// проверки на неё нигде в приложении, пока это не допишут отдельно.
@Controller('roles')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
export class RolesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.role.findMany({
      orderBy: { id: 'asc' },
      include: { _count: { select: { users: true } } },
    });
  }

  @Post()
  async create(@Body() body: unknown) {
    const parsed = createRoleSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    try {
      return await this.prisma.role.create({
        data: { name: parsed.data.name },
        include: { _count: { select: { users: true } } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Роль с таким названием уже существует');
      }
      throw error;
    }
  }
}
