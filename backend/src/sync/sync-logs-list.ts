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
};

// Только статус/триггер — практичные поля для мультивыбора (пара значений каждое).
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

// Общий для всех 5 типов синхронов список логов (SyncLog — одна таблица, партиционированная
// полем type) — контроллеры вызывают это вместо дублирования одного и того же запроса.
// rowNumber — порядковый номер строки в текущей выдаче (зависит от сортировки/страницы),
// в отличие от id (сквозной по всей таблице SyncLog, не только по этому типу синхрона) —
// id остаётся в ответе и показывается только в модалке "Подробнее" на фронте.
export async function listSyncLogs(prisma: PrismaService, syncType: string, query: SyncLogsListQuery) {
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
      // Битый JSON в необязательном параметре — просто игнорируем фильтры, не 400'им весь запрос.
    }
  }

  const searchClause: Prisma.SyncLogWhereInput | undefined = search
    ? { OR: SEARCHABLE_FIELDS.map((field) => ({ [field]: { contains: search, mode: 'insensitive' as const } })) }
    : undefined;

  const where: Prisma.SyncLogWhereInput = {
    type: syncType,
    ...(searchClause || filterClauses.length > 0 ? { AND: [...(searchClause ? [searchClause] : []), ...filterClauses] } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.syncLog.findMany({
      where,
      orderBy: { [sortField]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.syncLog.count({ where }),
  ]);

  const data = rows.map((row, index) => ({ ...row, rowNumber: (page - 1) * pageSize + index + 1 }));

  return { data, total, page, pageSize };
}

// Значения статуса/триггера в БД — английские enum-константы, для фильтра в UI
// нужны русские подписи (тот же перевод, что и во фронтовом lib/sync-format.ts).
const FACET_LABELS: Record<FilterableField, Record<string, string>> = {
  status: { RUNNING: 'В процессе', SUCCESS: 'Успешно', FAILED: 'Ошибка' },
  trigger: { CRON: 'Автоматически', MANUAL: 'Вручную' },
};

export async function syncLogFacetValues(prisma: PrismaService, syncType: string, field: string) {
  if (!isFilterableField(field)) {
    return [];
  }

  const rows = await prisma.syncLog.findMany({
    where: { type: syncType, [field]: { notIn: [''] } },
    select: { [field]: true },
    distinct: [field as unknown as Prisma.SyncLogScalarFieldEnum],
    orderBy: { [field]: 'asc' },
    take: 500,
  });

  return rows.map((row) => {
    const value = (row as unknown as Record<string, string>)[field];
    return { value, label: FACET_LABELS[field][value] ?? value };
  });
}
