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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ensureUserRecord } from '../users/ensure-user';
import { AuditLogService } from '../audit-log/audit-log.service';
import { pickCurrentCharacteristics } from './current-characteristics';
import { fromStoredValue, toStoredValue } from './characteristic-value';

function requireUser(req: Request) {
  if (!req.user) {
    throw new BadRequestException('Не удалось определить пользователя сессии');
  }
  return req.user;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const SEARCHABLE_FIELDS = ['room'] as const;
const SORTABLE_FIELDS: Record<string, string> = { room: 'room' };
const FILTERABLE_FIELDS = [] as const;
type FilterableField = (typeof FILTERABLE_FIELDS)[number];

function isFilterableField(field: string): field is FilterableField {
  return (FILTERABLE_FIELDS as readonly string[]).includes(field);
}

// Этаж — теперь обычная (защищённая) характеристика, а не колонка Room, но при создании
// комнаты его всё равно нужно указать явно (раньше выводился регуляркой из номера, теперь
// такого автоматизма нет) — см. create().
const FLOOR_DEFINITION_NAME = 'Этаж';

const createRoomSchema = z.object({ room: z.string().trim().min(1), floor: z.number().int() });
const updateRoomSchema = z.object({ room: z.string().trim().min(1) });
const createValueSchema = z.object({
  definitionId: z.number().int(),
  period: z.coerce.date(),
  value: z.union([z.boolean(), z.number(), z.string()]),
});
const updateValueSchema = z.object({
  period: z.coerce.date().optional(),
  value: z.union([z.boolean(), z.number(), z.string()]).optional(),
});

function parseIdParam(idParam: string): number {
  const id = Number.parseInt(idParam, 10);
  if (!Number.isInteger(id)) {
    throw new BadRequestException('Некорректный id');
  }
  return id;
}

@Controller('rooms')
@UseGuards(AuthGuard, RolesGuard)
@Roles('STAFF', 'ADMIN')
export class RoomsController {
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
    const sortField = SORTABLE_FIELDS[sortByParam ?? ''] ?? 'room';
    const sortDir: Prisma.SortOrder = sortDirParam === 'desc' ? 'desc' : 'asc';

    const filterClauses: Prisma.RoomWhereInput[] = [];
    if (filtersParam) {
      try {
        const parsed: unknown = JSON.parse(filtersParam);
        if (parsed && typeof parsed === 'object') {
          for (const [field, values] of Object.entries(parsed as Record<string, unknown>)) {
            if (!isFilterableField(field) || !Array.isArray(values) || values.length === 0) continue;
            const numberValues = values.map((v) => Number(v)).filter((v) => Number.isFinite(v));
            if (numberValues.length === 0) continue;
            filterClauses.push({ [field]: { in: numberValues } });
          }
        }
      } catch {
        // Битый JSON в необязательном параметре — просто игнорируем фильтры, не 400'им весь запрос.
      }
    }

    const searchClause: Prisma.RoomWhereInput | undefined = search
      ? { OR: SEARCHABLE_FIELDS.map((field) => ({ [field]: { contains: search, mode: 'insensitive' } })) }
      : undefined;

    const where: Prisma.RoomWhereInput | undefined =
      searchClause || filterClauses.length > 0 ? { AND: [...(searchClause ? [searchClause] : []), ...filterClauses] } : undefined;

    const [data, total] = await Promise.all([
      this.prisma.room.findMany({
        where,
        orderBy: { [sortField]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.room.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  @Get('facets/:field')
  facetValues(@Param('field') field: string) {
    // Фильтруемых полей у комнат сейчас нет — этаж переехал в характеристики
    // (см. FLOOR_DEFINITION_NAME), сортировать/фильтровать список комнат по нему
    // отдельно не нужно, он смотрится на карточке конкретной комнаты.
    void field;
    return [];
  }

  // Все комнаты с текущим этажом — для дерева "Общежитие → этажи → комнаты" на фронте.
  // Без пагинации: комнат в общежитии немного, тянуть их разом дешевле, чем N+1
  // fetchRoomDetail на каждую. Регистрировать строго до @Get(':id') — иначе Nest
  // примет "tree" за id.
  @Get('tree')
  async tree() {
    const floorDefinition = await this.prisma.roomCharacteristicDefinition.findUnique({
      where: { name: FLOOR_DEFINITION_NAME },
    });
    const rooms = await this.prisma.room.findMany({
      orderBy: { room: 'asc' },
      include: {
        characteristicValues: {
          where: { definitionId: floorDefinition?.id ?? -1 },
          orderBy: { period: 'desc' },
          take: 1,
        },
      },
    });
    return rooms.map((room) => ({
      id: room.id,
      room: room.room,
      floor: room.characteristicValues[0] ? (fromStoredValue('NUMBER', room.characteristicValues[0]) as number | null) : null,
    }));
  }

  @Get(':id')
  async detail(@Param('id') idParam: string) {
    const id = parseIdParam(idParam);
    const room = await this.prisma.room.findUnique({
      where: { id },
      include: {
        characteristicValues: {
          include: { definition: true },
          // period без второго ключа даёт непредсказуемый порядок среди записей
          // с одинаковым period (сиды все на 01.09.2026) — имя характеристики
          // тай-брейкером делает историю стабильной и читаемой.
          orderBy: [{ period: 'desc' }, { definition: { name: 'asc' } }],
        },
      },
    });
    if (!room) {
      throw new NotFoundException('Комната не найдена');
    }

    const { characteristicValues, ...roomFields } = room;
    return {
      ...roomFields,
      characteristics: pickCurrentCharacteristics(characteristicValues),
      history: characteristicValues.map((row) => ({
        id: row.id,
        definitionId: row.definitionId,
        name: row.definition.name,
        valueType: row.definition.valueType,
        unit: row.definition.unit,
        period: row.period,
        value: fromStoredValue(row.definition.valueType, row),
        isProtected: row.isProtected,
      })),
    };
  }

  @Post()
  async create(@Body() body: unknown, @Req() req: Request) {
    const parsed = createRoomSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    const sessionUser = requireUser(req);

    const floorDefinition = await this.prisma.roomCharacteristicDefinition.findUnique({
      where: { name: FLOOR_DEFINITION_NAME },
    });
    if (!floorDefinition) {
      // Не должно происходить в проде (заведено миграцией), но каталог теоретически
      // редактируется через UI — на всякий случай не 500'им без объяснения.
      throw new ConflictException('Характеристика "Этаж" не найдена в каталоге');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const room = await tx.room.create({ data: { room: parsed.data.room } });
        await tx.roomCharacteristicValue.create({
          data: { roomId: room.id, definitionId: floorDefinition.id, period: new Date(), valueNumber: parsed.data.floor },
        });

        const userId = await ensureUserRecord(tx, sessionUser);
        await this.auditLog.log(tx, {
          userId,
          action: 'CREATE',
          entityType: 'Room',
          entityId: room.id,
          entityLabel: room.room,
          before: null,
          after: room,
          fields: ['room'],
        });

        return room;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Комната с таким номером уже существует');
      }
      throw error;
    }
  }

  @Patch(':id')
  async update(@Param('id') idParam: string, @Body() body: unknown, @Req() req: Request) {
    const id = parseIdParam(idParam);
    const parsed = updateRoomSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    const sessionUser = requireUser(req);
    const existing = await this.prisma.room.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Комната не найдена');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.room.update({ where: { id }, data: { room: parsed.data.room } });
        const userId = await ensureUserRecord(tx, sessionUser);
        await this.auditLog.log(tx, {
          userId,
          action: 'UPDATE',
          entityType: 'Room',
          entityId: updated.id,
          entityLabel: updated.room,
          before: existing,
          after: updated,
          fields: ['room'],
        });
        return updated;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Комната с таким номером уже существует');
      }
      throw error;
    }
  }

  @Delete(':id')
  async remove(@Param('id') idParam: string, @Req() req: Request) {
    const id = parseIdParam(idParam);
    const sessionUser = requireUser(req);
    const existing = await this.prisma.room.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Комната не найдена');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.room.delete({ where: { id } });
        const userId = await ensureUserRecord(tx, sessionUser);
        await this.auditLog.log(tx, {
          userId,
          action: 'DELETE',
          entityType: 'Room',
          entityId: id,
          entityLabel: existing.room,
          before: existing,
          after: null,
          fields: ['room'],
        });
        return existing;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Комната не найдена');
      }
      throw error;
    }
  }

  @Post(':id/characteristics')
  async addCharacteristicValue(@Param('id') idParam: string, @Body() body: unknown, @Req() req: Request) {
    const roomId = parseIdParam(idParam);
    const parsed = createValueSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    const sessionUser = requireUser(req);

    const [definition, room] = await Promise.all([
      this.prisma.roomCharacteristicDefinition.findUnique({ where: { id: parsed.data.definitionId } }),
      this.prisma.room.findUnique({ where: { id: roomId } }),
    ]);
    if (!definition) {
      throw new NotFoundException('Характеристика не найдена');
    }
    if (!room) {
      throw new NotFoundException('Комната не найдена');
    }

    const stored = toStoredValue(definition.valueType, parsed.data.value);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.roomCharacteristicValue.create({
          data: { roomId, definitionId: definition.id, period: parsed.data.period, ...stored },
        });
        const userId = await ensureUserRecord(tx, sessionUser);
        await this.auditLog.log(tx, {
          userId,
          action: 'CREATE',
          entityType: 'RoomCharacteristicValue',
          entityId: created.id,
          entityLabel: `${definition.name} — комната ${room.room}`,
          before: null,
          after: { period: created.period, value: fromStoredValue(definition.valueType, created) },
          fields: ['period', 'value'],
        });
        return { ...created, value: fromStoredValue(definition.valueType, created) };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('На эту дату уже есть значение этой характеристики для этой комнаты');
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new NotFoundException('Комната не найдена');
      }
      throw error;
    }
  }

  @Patch(':id/characteristics/:valueId')
  async updateCharacteristicValue(
    @Param('id') idParam: string,
    @Param('valueId') valueIdParam: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const roomId = parseIdParam(idParam);
    const valueId = parseIdParam(valueIdParam);
    const parsed = updateValueSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    const sessionUser = requireUser(req);

    const existing = await this.prisma.roomCharacteristicValue.findFirst({
      where: { id: valueId, roomId },
      include: { definition: true, room: true },
    });
    if (!existing) {
      throw new NotFoundException('Значение характеристики не найдено');
    }
    if (existing.isProtected) {
      throw new ConflictException('Это значение нельзя изменить');
    }

    const stored = parsed.data.value === undefined ? {} : toStoredValue(existing.definition.valueType, parsed.data.value);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.roomCharacteristicValue.update({
          where: { id: valueId },
          data: { ...(parsed.data.period ? { period: parsed.data.period } : {}), ...stored },
        });
        const userId = await ensureUserRecord(tx, sessionUser);
        await this.auditLog.log(tx, {
          userId,
          action: 'UPDATE',
          entityType: 'RoomCharacteristicValue',
          entityId: updated.id,
          entityLabel: `${existing.definition.name} — комната ${existing.room.room}`,
          before: { period: existing.period, value: fromStoredValue(existing.definition.valueType, existing) },
          after: { period: updated.period, value: fromStoredValue(existing.definition.valueType, updated) },
          fields: ['period', 'value'],
        });
        return { ...updated, value: fromStoredValue(existing.definition.valueType, updated) };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('На эту дату уже есть значение этой характеристики для этой комнаты');
      }
      throw error;
    }
  }

  @Delete(':id/characteristics/:valueId')
  async removeCharacteristicValue(@Param('id') idParam: string, @Param('valueId') valueIdParam: string, @Req() req: Request) {
    const roomId = parseIdParam(idParam);
    const valueId = parseIdParam(valueIdParam);
    const sessionUser = requireUser(req);

    const existing = await this.prisma.roomCharacteristicValue.findFirst({
      where: { id: valueId, roomId },
      include: { definition: true, room: true },
    });
    if (!existing) {
      throw new NotFoundException('Значение характеристики не найдено');
    }
    if (existing.isProtected) {
      throw new ConflictException('Это значение нельзя удалить');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.roomCharacteristicValue.delete({ where: { id: valueId } });
      const userId = await ensureUserRecord(tx, sessionUser);
      await this.auditLog.log(tx, {
        userId,
        action: 'DELETE',
        entityType: 'RoomCharacteristicValue',
        entityId: existing.id,
        entityLabel: `${existing.definition.name} — комната ${existing.room.room}`,
        before: { period: existing.period, value: fromStoredValue(existing.definition.valueType, existing) },
        after: null,
        fields: ['period', 'value'],
      });
      return existing;
    });
  }
}
