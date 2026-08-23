import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Создание',
  UPDATE: 'Изменение',
  DELETE: 'Удаление',
};

// Держать в синхроне со всеми entityType, которые реально передаются в
// AuditLogService.log() по проекту (см. contracts/individuals/rooms/billing/users/roles
// контроллеры) — иначе фильтр по этому полю не покажет вариант в списке.
const ENTITY_TYPE_LABELS: Record<string, string> = {
  Individual: 'Физическое лицо',
  Contract: 'Договор',
  Payment: 'Платёж',
  Room: 'Комната',
  RoomCharacteristicDefinition: 'Характеристика комнаты',
  RoomCharacteristicValue: 'Значение характеристики',
  DormitoryInfo: 'Настройки общежития',
  Role: 'Роль',
  UserRole: 'Роль пользователя',
  User: 'Пользователь',
};

const SEARCHABLE_FIELDS = ['entityLabel', 'action', 'entityType'] as const;

const SORTABLE_FIELDS: Record<string, string> = {
  createdAt: 'createdAt',
  action: 'action',
  entityType: 'entityType',
  entityLabel: 'entityLabel',
};

// action/entityType — практичные поля для мультивыбора (небольшой фиксированный набор
// значений), та же схема, что "role"/"status" в других реестрах проекта.
const FILTERABLE_FIELDS = ['action', 'entityType'] as const;
type FilterableField = (typeof FILTERABLE_FIELDS)[number];
function isFilterableField(field: string): field is FilterableField {
  return (FILTERABLE_FIELDS as readonly string[]).includes(field);
}

// Только ADMIN — история изменений показывает в т.ч. персональные данные (см. changes),
// тот же уровень доступа, что и у SyncLogs/users/roles (см. "Роли и права доступа" в промпте).
@Controller('audit-log')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
export class AuditLogController {
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
    const sortField = SORTABLE_FIELDS[sortByParam ?? ''] ?? 'createdAt';
    const sortDir: Prisma.SortOrder = sortDirParam === 'asc' ? 'asc' : 'desc';

    const filterClauses: Prisma.AuditLogWhereInput[] = [];
    if (filtersParam) {
      try {
        const parsed: unknown = JSON.parse(filtersParam);
        if (parsed && typeof parsed === 'object') {
          for (const [field, values] of Object.entries(parsed as Record<string, unknown>)) {
            if (!isFilterableField(field) || !Array.isArray(values) || values.length === 0) continue;
            const stringValues = values.filter((v): v is string => typeof v === 'string');
            if (stringValues.length === 0) continue;
            filterClauses.push({ [field]: { in: stringValues } });
          }
        }
      } catch {
        // Битый JSON в необязательном параметре — просто игнорируем фильтры, не 400'им весь запрос.
      }
    }

    const searchClause: Prisma.AuditLogWhereInput | undefined = search
      ? { OR: SEARCHABLE_FIELDS.map((field) => ({ [field]: { contains: search, mode: 'insensitive' } })) }
      : undefined;

    const where: Prisma.AuditLogWhereInput | undefined =
      searchClause || filterClauses.length > 0 ? { AND: [...(searchClause ? [searchClause] : []), ...filterClauses] } : undefined;

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { [sortField]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { fullName: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: data.map((row) => ({
        id: row.id,
        userFullName: row.user.fullName,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        entityLabel: row.entityLabel,
        changes: row.changes,
        createdAt: row.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  // action/entityType — фиксированный небольшой список значений (не растущий со временем
  // список из БД, как факультет/курс в других реестрах) — просто хардкод, тот же приём, что
  // и у статусов договора/движения проживающих в reports.controller.ts.
  @Get('facets/:field')
  facetValues(@Param('field') field: string) {
    if (field === 'action') {
      return Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }));
    }
    if (field === 'entityType') {
      return Object.entries(ENTITY_TYPE_LABELS).map(([value, label]) => ({ value, label }));
    }
    return [];
  }
}
