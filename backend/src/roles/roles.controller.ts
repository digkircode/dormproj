import { BadRequestException, Body, ConflictException, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ensureUserRecord } from '../users/ensure-user';
import { AuditLogService } from '../audit-log/audit-log.service';

const createRoleSchema = z.object({ name: z.string().trim().min(1).max(50) });

// Справочник ролей — только ADMIN. Создание новой роли тут не даёт ей автоматически
// никаких прав — @Roles()/RolesGuard по коду проверяют конкретные строковые ключи
// ('ADMIN'/'STAFF'/'RESIDENT'), новое имя роли просто ляжет в таблицу без единой
// проверки на неё нигде в приложении, пока это не допишут отдельно.
@Controller('roles')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
export class RolesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Get()
  list() {
    return this.prisma.role.findMany({
      orderBy: { id: 'asc' },
      include: { _count: { select: { users: true } } },
    });
  }

  @Post()
  async create(@Body() body: unknown, @Req() req: Request) {
    const parsed = createRoleSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    if (!req.user) {
      throw new BadRequestException('Не удалось определить пользователя сессии');
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.role.create({ data: { name: parsed.data.name } });
        const userId = await ensureUserRecord(tx, req.user!);
        await this.auditLog.log(tx, {
          userId,
          action: 'CREATE',
          entityType: 'Role',
          entityId: created.id,
          entityLabel: created.name,
          before: null,
          after: created,
          fields: ['name'],
        });
        return tx.role.findUniqueOrThrow({ where: { id: created.id }, include: { _count: { select: { users: true } } } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Роль с таким названием уже существует');
      }
      throw error;
    }
  }
}
