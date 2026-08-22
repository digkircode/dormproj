import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Prisma, RoomCharacteristicValueType } from '../../generated/prisma/client.js';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ensureUserRecord } from '../users/ensure-user';
import { AuditLogService } from '../audit-log/audit-log.service';

function requireUser(req: Request) {
  if (!req.user) {
    throw new BadRequestException('Не удалось определить пользователя сессии');
  }
  return req.user;
}

const createSchema = z.object({
  name: z.string().trim().min(1),
  valueType: z.enum(RoomCharacteristicValueType),
  unit: z.string().trim().min(1).nullish(),
});
// valueType сознательно нельзя поменять после создания — уже записанные значения лежат
// в конкретной типизированной колонке (см. characteristic-value.ts), смена типа задним
// числом рассинхронизирует историю с новым valueType без пересчёта всех старых записей.
const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  unit: z.string().trim().min(1).nullish(),
});
const reorderSchema = z.object({ ids: z.array(z.number().int()).min(1) });

function parseIdParam(idParam: string): number {
  const id = Number.parseInt(idParam, 10);
  if (!Number.isInteger(id)) {
    throw new BadRequestException('Некорректный id');
  }
  return id;
}

// Список (GET) остаётся доступен и STAFF — им пользуется страница "Комнаты"
// (RoomDetailPanel.vue, выбор характеристики при добавлении значения), а не только
// admin-страница "Характеристики комнат". Мутации (создание/переименование/удаление/
// порядок самих типов характеристик) — только ADMIN, см. @Roles('ADMIN') на методах ниже.
@Controller('room-characteristic-definitions')
@UseGuards(AuthGuard, RolesGuard)
@Roles('STAFF', 'ADMIN')
export class RoomCharacteristicDefinitionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Get()
  list() {
    // По sortOrder — ручной порядок через drag-and-drop в UI (не по id/имени),
    // новые характеристики получают max(sortOrder)+1 при создании, см. create().
    return this.prisma.roomCharacteristicDefinition.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  @Post()
  @Roles('ADMIN')
  async create(@Body() body: unknown, @Req() req: Request) {
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    const sessionUser = requireUser(req);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const last = await tx.roomCharacteristicDefinition.findFirst({ orderBy: { sortOrder: 'desc' } });
        const created = await tx.roomCharacteristicDefinition.create({
          data: {
            name: parsed.data.name,
            valueType: parsed.data.valueType,
            unit: parsed.data.unit ?? null,
            sortOrder: (last?.sortOrder ?? 0) + 1,
          },
        });
        const userId = await ensureUserRecord(tx, sessionUser);
        await this.auditLog.log(tx, {
          userId,
          action: 'CREATE',
          entityType: 'RoomCharacteristicDefinition',
          entityId: created.id,
          entityLabel: created.name,
          before: null,
          after: created,
          fields: ['name', 'valueType', 'unit'],
        });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Характеристика с таким названием уже существует');
      }
      throw error;
    }
  }

  // Перетаскивание строк в UI — ids в новом порядке целиком, sortOrder переставляется
  // по позиции в массиве. Регистрируется раньше ":id" ниже, иначе Nest примет "reorder"
  // за id и упадёт в parseIdParam. Один audit-лог на весь reorder (не по строке на
  // характеристику) — иначе перетаскивание одной строки в конец списка со многими
  // характеристиками плодило бы десятки записей истории почти без полезного сигнала.
  @Patch('reorder')
  @Roles('ADMIN')
  async reorder(@Body() body: unknown, @Req() req: Request) {
    const parsed = reorderSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    const sessionUser = requireUser(req);
    const before = await this.prisma.roomCharacteristicDefinition.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } });

    await this.prisma.$transaction(async (tx) => {
      await Promise.all(
        parsed.data.ids.map((id, index) => tx.roomCharacteristicDefinition.update({ where: { id }, data: { sortOrder: index } })),
      );
      const userId = await ensureUserRecord(tx, sessionUser);
      await this.auditLog.log(tx, {
        userId,
        action: 'UPDATE',
        entityType: 'RoomCharacteristicDefinition',
        entityId: 'order',
        entityLabel: 'Порядок характеристик комнат',
        before: { order: before.map((d) => d.name) },
        after: { order: parsed.data.ids },
        fields: ['order'],
      });
    });
    return this.list();
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(@Param('id') idParam: string, @Body() body: unknown, @Req() req: Request) {
    const id = parseIdParam(idParam);
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    const sessionUser = requireUser(req);
    const existing = await this.prisma.roomCharacteristicDefinition.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Характеристика не найдена');
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.roomCharacteristicDefinition.update({
          where: { id },
          data: { ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}), ...(parsed.data.unit !== undefined ? { unit: parsed.data.unit } : {}) },
        });
        const userId = await ensureUserRecord(tx, sessionUser);
        await this.auditLog.log(tx, {
          userId,
          action: 'UPDATE',
          entityType: 'RoomCharacteristicDefinition',
          entityId: updated.id,
          entityLabel: updated.name,
          before: existing,
          after: updated,
          fields: ['name', 'valueType', 'unit'],
        });
        return updated;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Характеристика не найдена');
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Характеристика с таким названием уже существует');
      }
      throw error;
    }
  }

  @Delete(':id')
  @Roles('ADMIN')
  async remove(@Param('id') idParam: string, @Req() req: Request) {
    const id = parseIdParam(idParam);
    const sessionUser = requireUser(req);
    const existing = await this.prisma.roomCharacteristicDefinition.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Характеристика не найдена');
    }
    if (existing.isProtected) {
      throw new ConflictException('Эту характеристику нельзя удалить');
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.roomCharacteristicDefinition.delete({ where: { id } });
        const userId = await ensureUserRecord(tx, sessionUser);
        await this.auditLog.log(tx, {
          userId,
          action: 'DELETE',
          entityType: 'RoomCharacteristicDefinition',
          entityId: id,
          entityLabel: existing.name,
          before: existing,
          after: null,
          fields: ['name', 'valueType', 'unit'],
        });
        return existing;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Характеристика не найдена');
      }
      // FK RESTRICT — у характеристики ещё есть значения, вручную сформулированная ошибка
      // понятнее сотруднику, чем сырой код ограничения БД.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException('Нельзя удалить характеристику, пока у неё есть значения у комнат');
      }
      throw error;
    }
  }
}
