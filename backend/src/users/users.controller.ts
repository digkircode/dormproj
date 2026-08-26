import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ensureUserRecord } from './ensure-user';
import { AuditLogService } from '../audit-log/audit-log.service';
import { zodErrorMessage } from '../i18n/zod-error-message';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const SEARCHABLE_FIELDS = ['fullName', 'email'] as const;

// "Список пользователей" (Администратор → Пользователи) — сырые users+users_roles без
// фильтра "хотя бы одна не-RESIDENT роль" (в отличие от list() ниже, той под "Сотрудники")
// — здесь реально ВСЕ строки users, включая чистых "Проживающих" и записи вообще без
// единой роли. По прямой просьбе 2026-08-23 — нужно видеть/чинить bind_id/azure_id/
// univer_id вручную, тот список их не показывает вообще.
const ALL_USERS_SEARCHABLE_FIELDS = ['fullName', 'email', 'bindId', 'azureId', 'univerId'] as const;
const ALL_USERS_SORTABLE_FIELDS: Record<string, string> = {
  fullName: 'fullName',
  email: 'email',
  bindId: 'bindId',
  azureId: 'azureId',
  univerId: 'univerId',
  createdAt: 'createdAt',
};

const updateUserLinksSchema = z.object({
  azureId: z.string().trim().optional().nullable(),
  univerId: z.string().trim().optional().nullable(),
});
const SORTABLE_FIELDS: Record<string, string> = {
  fullName: 'fullName',
  email: 'email',
};

const grantRoleSchema = z.object({ roleId: z.number().int() });

function parseIdParam(idParam: string): number {
  const id = Number.parseInt(idParam, 10);
  if (!Number.isInteger(id)) {
    throw new BadRequestException('contracts.errors.invalidId');
  }
  return id;
}

// Страница "Сотрудники" (Администратор → Пользователи) — только ADMIN, тот же
// принцип, что и у остальных admin-контроллеров (см. промпт проекта).
@Controller('users')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  private async userWithRoles(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { roles: { include: { role: true }, orderBy: { role: { name: 'asc' } } } },
    });
    if (!user) {
      throw new NotFoundException('users.errors.userNotFound');
    }
    return { id: user.id, fullName: user.fullName, email: user.email, roles: user.roles.map((r) => r.role) };
  }

  // Список — только пользователи, у которых есть хотя бы одна роль (по прямой
  // просьбе): аккаунт без роли появляется тут не раньше, чем ему что-то выдадут
  // через "Выдать роль" (см. search() ниже — та ищет среди ВСЕХ пользователей,
  // не только уже имеющих роль, иначе некому было бы выдать первую роль).
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

    let roleNames: string[] = [];
    if (filtersParam) {
      try {
        const parsed: unknown = JSON.parse(filtersParam);
        if (parsed && typeof parsed === 'object') {
          const values = (parsed as Record<string, unknown>).role;
          if (Array.isArray(values)) {
            roleNames = values.filter((v): v is string => typeof v === 'string');
          }
        }
      } catch {
        // Битый JSON в необязательном параметре — просто игнорируем фильтр, не 400'им весь запрос.
      }
    }

    const searchClause: Prisma.UserWhereInput | undefined = search
      ? { OR: SEARCHABLE_FIELDS.map((field) => ({ [field]: { contains: search, mode: 'insensitive' } })) }
      : undefined;

    const where: Prisma.UserWhereInput = {
      AND: [
        { roles: roleNames.length ? { some: { role: { name: { in: roleNames } } } } : { some: {} } },
        // Скрываем только ЧИСТЫХ проживающих (единственная роль — RESIDENT) — сотрудник,
        // который сам живёт в общежитии (RESIDENT + STAFF/ADMIN), в списке остаётся, по
        // прямой просьбе. "Есть хотя бы одна НЕ-RESIDENT роль" — то же самое, что "не
        // единственная роль RESIDENT", без отдельного count-запроса.
        { roles: { some: { role: { name: { not: 'RESIDENT' } } } } },
        ...(searchClause ? [searchClause] : []),
      ],
    };

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { [sortField]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { roles: { include: { role: true }, orderBy: { role: { name: 'asc' } } } },
      }),
      this.prisma.user.count({ where }),
    ]);

    const data = rows.map((u) => ({ id: u.id, fullName: u.fullName, email: u.email, roles: u.roles.map((r) => r.role) }));
    return { data, total, page, pageSize };
  }

  // "Список пользователей" — все строки users как есть, без фильтра по наличию роли
  // (см. константы выше). Регистрируется раньше ":id"-подобных маршрутов ниже не нужно —
  // 'all' литеральный путь, Nest не спутает его с параметром (та же логика, что у 'search'/
  // 'facets' выше).
  @Get('all')
  async listAll(
    @Query('page') pageParam?: string,
    @Query('pageSize') pageSizeParam?: string,
    @Query('search') searchParam?: string,
    @Query('sortBy') sortByParam?: string,
    @Query('sortDir') sortDirParam?: string,
  ) {
    const page = Math.max(1, Number.parseInt(pageParam ?? '', 10) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(pageSizeParam ?? '', 10) || DEFAULT_PAGE_SIZE));
    const search = searchParam?.trim();
    const sortField = ALL_USERS_SORTABLE_FIELDS[sortByParam ?? ''] ?? 'fullName';
    const sortDir: Prisma.SortOrder = sortDirParam === 'desc' ? 'desc' : 'asc';

    const where: Prisma.UserWhereInput | undefined = search
      ? { OR: ALL_USERS_SEARCHABLE_FIELDS.map((field) => ({ [field]: { contains: search, mode: 'insensitive' } })) }
      : undefined;

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { [sortField]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { roles: { include: { role: true }, orderBy: { role: { name: 'asc' } } } },
      }),
      this.prisma.user.count({ where }),
    ]);

    const data = rows.map((u) => ({
      id: u.id,
      bindId: u.bindId,
      azureId: u.azureId,
      univerId: u.univerId,
      fullName: u.fullName,
      email: u.email,
      roles: u.roles.map((r) => r.role),
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }));
    return { data, total, page, pageSize };
  }

  // Ручная правка привязки к 1С/Azure — по прямой просьбе 2026-08-23, единственное место
  // в проекте, где эти поля вообще редактируются через UI (иначе только разовым импортом,
  // см. промпт проекта). univerId — настоящий FK на Individual.fizicheskoyeLitsoUid,
  // несуществующий uid Prisma отклонит сам (P2003) — понятная ошибка вместо сырого кода.
  @Patch(':id')
  async updateLinks(@Param('id') idParam: string, @Body() body: unknown, @Req() req: Request) {
    const id = parseIdParam(idParam);
    const parsed = updateUserLinksSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(zodErrorMessage(parsed.error));
    }
    if (!req.user) {
      throw new BadRequestException('contracts.errors.sessionUserNotFound');
    }
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('users.errors.userNotFound');
    }

    const azureId = parsed.data.azureId?.trim() || null;
    const univerId = parsed.data.univerId?.trim() || null;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({ where: { id }, data: { azureId, univerId } });
        const actorId = await ensureUserRecord(tx, req.user!);
        await this.auditLog.log(tx, {
          userId: actorId,
          action: 'UPDATE',
          entityType: 'User',
          entityId: id,
          entityLabel: updated.fullName,
          before: { azureId: existing.azureId, univerId: existing.univerId },
          after: { azureId: updated.azureId, univerId: updated.univerId },
          fields: ['azureId', 'univerId'],
        });
        return updated;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new BadRequestException('users.errors.individualUidNotFound');
      }
      throw error;
    }
  }

  @Get('facets/:field')
  async facets(@Param('field') field: string) {
    if (field !== 'role') return [];
    // RESIDENT остаётся в фильтре — сотрудник, который сам проживает (RESIDENT+STAFF/
    // ADMIN), в списке есть (см. where в list() выше), фильтр по RESIDENT найдёт именно таких.
    const roles = await this.prisma.role.findMany({ orderBy: { name: 'asc' } });
    return roles.map((r) => ({ value: r.name, label: r.name }));
  }

  // Поиск среди ВСЕХ пользователей (не только уже имеющих роль) — для диалога
  // выдачи роли: нужно найти и того, кому роль ещё никогда не назначали.
  @Get('search')
  async search(@Query('q') q?: string) {
    const query = (q ?? '').trim();
    if (!query) return [];
    const users = await this.prisma.user.findMany({
      where: { OR: [{ fullName: { contains: query, mode: 'insensitive' } }, { email: { contains: query, mode: 'insensitive' } }] },
      orderBy: { fullName: 'asc' },
      take: 10,
      include: { roles: { include: { role: true } } },
    });
    return users.map((u) => ({ id: u.id, fullName: u.fullName, email: u.email, roles: u.roles.map((r) => r.role) }));
  }

  @Post(':id/roles')
  async grantRole(@Param('id') idParam: string, @Body() body: unknown, @Req() req: Request) {
    const id = parseIdParam(idParam);
    const parsed = grantRoleSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(zodErrorMessage(parsed.error));
    }
    if (!req.user) {
      throw new BadRequestException('contracts.errors.sessionUserNotFound');
    }
    const [user, role] = await Promise.all([
      this.prisma.user.findUnique({ where: { id } }),
      this.prisma.role.findUnique({ where: { id: parsed.data.roleId } }),
    ]);
    if (!user) throw new NotFoundException('users.errors.userNotFound');
    if (!role) throw new NotFoundException('users.errors.roleNotFound');

    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.upsert({
        where: { userId_roleId: { userId: id, roleId: role.id } },
        create: { userId: id, roleId: role.id },
        update: {},
      });
      const actorId = await ensureUserRecord(tx, req.user!);
      await this.auditLog.log(tx, {
        userId: actorId,
        action: 'CREATE',
        entityType: 'UserRole',
        entityId: id,
        entityLabel: `${user.fullName} — роль «${role.name}»`,
        before: null,
        after: { roleName: role.name },
        fields: ['roleName'],
      });
    });
    return this.userWithRoles(id);
  }

  @Delete(':id/roles/:roleId')
  async revokeRole(@Param('id') idParam: string, @Param('roleId') roleIdParam: string, @Req() req: Request) {
    const id = parseIdParam(idParam);
    const roleId = parseIdParam(roleIdParam);
    if (!req.user) {
      throw new BadRequestException('contracts.errors.sessionUserNotFound');
    }
    const [user, role] = await Promise.all([
      this.prisma.user.findUnique({ where: { id } }),
      this.prisma.role.findUnique({ where: { id: roleId } }),
    ]);
    if (!user) throw new NotFoundException('users.errors.userNotFound');

    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id, roleId } });
      if (role) {
        const actorId = await ensureUserRecord(tx, req.user!);
        await this.auditLog.log(tx, {
          userId: actorId,
          action: 'DELETE',
          entityType: 'UserRole',
          entityId: id,
          entityLabel: `${user.fullName} — роль «${role.name}»`,
          before: { roleName: role.name },
          after: null,
          fields: ['roleName'],
        });
      }
    });
    return this.userWithRoles(id);
  }
}
