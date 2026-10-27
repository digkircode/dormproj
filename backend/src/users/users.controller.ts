import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ensureUserRecord } from './ensure-user';
import { syncResidentRoles } from './resident-role-sync';
import { AuditLogService } from '../audit-log/audit-log.service';
import { zodErrorMessage } from '../i18n/zod-error-message';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const SEARCHABLE_FIELDS = ['fullName', 'email'] as const;

const ALL_USERS_SEARCHABLE_FIELDS = ['fullName', 'email', 'bindId', 'azureId', 'univerId'] as const;
const ALL_USERS_SORTABLE_FIELDS: Record<string, string> = {
  fullName: 'fullName',
  email: 'email',
  bindId: 'bindId',
  azureId: 'azureId',
  univerId: 'univerId',
  linkSource: 'linkSource',
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
      }
    }

    const searchClause: Prisma.UserWhereInput | undefined = search
      ? { OR: SEARCHABLE_FIELDS.map((field) => ({ [field]: { contains: search, mode: 'insensitive' } })) }
      : undefined;

    const where: Prisma.UserWhereInput = {
      AND: [
        { roles: roleNames.length ? { some: { role: { name: { in: roleNames } } } } : { some: {} } },
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

  @Get('all')
  async listAll(
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
    const sortField = ALL_USERS_SORTABLE_FIELDS[sortByParam ?? ''] ?? 'fullName';
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
      }
    }

    const searchClause: Prisma.UserWhereInput | undefined = search
      ? { OR: ALL_USERS_SEARCHABLE_FIELDS.map((field) => ({ [field]: { contains: search, mode: 'insensitive' } })) }
      : undefined;
    const roleClause: Prisma.UserWhereInput | undefined = roleNames.length
      ? { roles: { some: { role: { name: { in: roleNames } } } } }
      : undefined;
    const where: Prisma.UserWhereInput | undefined =
      searchClause || roleClause ? { AND: [...(searchClause ? [searchClause] : []), ...(roleClause ? [roleClause] : [])] } : undefined;

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
      linkSource: u.linkSource,
      fullName: u.fullName,
      email: u.email,
      roles: u.roles.map((r) => r.role),
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }));
    return { data, total, page, pageSize };
  }

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
        const updated = await tx.user.update({ where: { id }, data: { azureId, univerId, linkSource: 'MANUAL' } });
        await syncResidentRoles(tx, { userId: id });
        const actorId = await ensureUserRecord(tx, req.user!);
        await this.auditLog.log(tx, {
          userId: actorId,
          action: 'UPDATE',
          entityType: 'User',
          entityId: id,
          entityLabel: updated.fullName,
          before: { azureId: existing.azureId, univerId: existing.univerId, linkSource: existing.linkSource },
          after: { azureId: updated.azureId, univerId: updated.univerId, linkSource: updated.linkSource },
          fields: ['azureId', 'univerId', 'linkSource'],
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
    const roles = await this.prisma.role.findMany({ orderBy: { name: 'asc' } });
    return roles.map((r) => ({ value: r.name, label: r.name }));
  }

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
        entityLabel: `${user.fullName} - роль «${role.name}»`,
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

    if (role?.name === 'ADMIN' && id === req.user.id) {
      throw new BadRequestException('users.errors.cannotRevokeOwnAdminRole');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id, roleId } });
      if (role) {
        const actorId = await ensureUserRecord(tx, req.user!);
        await this.auditLog.log(tx, {
          userId: actorId,
          action: 'DELETE',
          entityType: 'UserRole',
          entityId: id,
          entityLabel: `${user.fullName} - роль «${role.name}»`,
          before: { roleName: role.name },
          after: null,
          fields: ['roleName'],
        });
      }
    });
    return this.userWithRoles(id);
  }
}
