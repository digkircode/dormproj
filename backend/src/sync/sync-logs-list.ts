import { I18nContext } from 'nestjs-i18n';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const SEARCHABLE_FIELDS = ['errorMessage'] as const;

const SORTABLE_FIELDS: Record<string, string> = {
  startedAt: 'startedAt',
  finishedAt: 'finishedAt',
  status: 'status',
  trigger: 'trigger',
  rowNumber: 'id',
};

const FILTERABLE_FIELDS = ['status', 'trigger'] as const;
type FilterableField = (typeof FILTERABLE_FIELDS)[number];

function isFilterableField(field: string): field is FilterableField {
  return (FILTERABLE_FIELDS as readonly string[]).includes(field);
}

export interface SyncLogsListQuery {
  page?: string;
  pageSize?: string;
  search?: string;
  sortBy?: string;
  sortDir?: string;
  filters?: string;
}

export async function listSyncLogs(prisma: PrismaService, syncType: string, query: SyncLogsListQuery, scope: Prisma.SyncLogWhereInput = { type: syncType }) {
  const page = Math.max(1, Number.parseInt(query.page ?? '', 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(query.pageSize ?? '', 10) || DEFAULT_PAGE_SIZE));
  const search = query.search?.trim();
  const sortField = SORTABLE_FIELDS[query.sortBy ?? ''] ?? 'startedAt';
  const sortDir: Prisma.SortOrder = query.sortDir === 'desc' ? 'desc' : 'asc';

  const filterClauses: Prisma.SyncLogWhereInput[] = [];
  if (query.filters) {
    try {
      const parsed: unknown = JSON.parse(query.filters);
      if (parsed && typeof parsed === 'object') {
        for (const [field, values] of Object.entries(parsed as Record<string, unknown>)) {
          if (!isFilterableField(field) || !Array.isArray(values) || values.length === 0) continue;
          const stringValues = values.filter((v): v is string => typeof v === 'string');
          if (stringValues.length === 0) continue;
          filterClauses.push({ [field]: { in: stringValues } });
        }
      }
    } catch {
    }
  }

  const searchClause: Prisma.SyncLogWhereInput | undefined = search
    ? { OR: SEARCHABLE_FIELDS.map((field) => ({ [field]: { contains: search, mode: 'insensitive' as const } })) }
    : undefined;

  const where: Prisma.SyncLogWhereInput = {
    AND: [scope, ...(searchClause ? [searchClause] : []), ...filterClauses],
  };

  const [rows, total, allIdsOfType] = await Promise.all([
    prisma.syncLog.findMany({
      where,
      orderBy: { [sortField]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.syncLog.count({ where }),
    prisma.syncLog.findMany({ where: scope, select: { id: true }, orderBy: { id: 'asc' } }),
  ]);

  const rowNumberById = new Map(allIdsOfType.map(({ id }, index) => [id, index + 1]));
  const data = rows.map((row) => ({ ...row, rowNumber: rowNumberById.get(row.id) ?? 0 }));

  return { data, total, page, pageSize };
}

const FACET_LABELS_RU: Record<FilterableField, Record<string, string>> = {
  status: { RUNNING: 'В процессе', SUCCESS: 'Успешно', FAILED: 'Ошибка' },
  trigger: { CRON: 'Автоматически', MANUAL: 'Вручную' },
};
function facetLabel(field: FilterableField, value: string): string {
  return I18nContext.current()?.t(`sync.${field}.${value}`) ?? FACET_LABELS_RU[field][value] ?? value;
}

export async function syncLogFacetValues(prisma: PrismaService, syncType: string, field: string, scope: Prisma.SyncLogWhereInput = { type: syncType }) {
  if (!isFilterableField(field)) {
    return [];
  }

  const rows = await prisma.syncLog.findMany({
    where: scope,
    select: { [field]: true },
    distinct: [field as unknown as Prisma.SyncLogScalarFieldEnum],
    orderBy: { [field]: 'asc' },
    take: 500,
  });

  return rows.map((row) => {
    const value = (row as unknown as Record<string, string>)[field];
    return { value, label: facetLabel(field, value) };
  });
}
