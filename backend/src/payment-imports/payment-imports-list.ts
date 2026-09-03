import { I18nContext } from 'nestjs-i18n';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import { parsePaymentImportCandidate } from './payment-import-candidate';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// Сортировка/фильтр — только по реальным колонкам (status/importedAt). Сумма/ФИО/дата
// платежа живут только внутри rawPayload (JSON) — сервер их не индексирует и не может
// сортировать/фильтровать на уровне SQL, только показать как есть после выборки страницы.
// При заметном росте объёма это стоит пересмотреть (денормализовать в отдельные колонки).
const SORTABLE_FIELDS: Record<string, string> = {
  importedAt: 'importedAt',
  status: 'status',
};
const FILTERABLE_FIELDS = ['status'] as const;
type FilterableField = (typeof FILTERABLE_FIELDS)[number];
function isFilterableField(field: string): field is FilterableField {
  return (FILTERABLE_FIELDS as readonly string[]).includes(field);
}

export interface PaymentImportsListQuery {
  page?: string;
  pageSize?: string;
  sortBy?: string;
  sortDir?: string;
  filters?: string;
}

export async function listPaymentImports(prisma: PrismaService, query: PaymentImportsListQuery) {
  const page = Math.max(1, Number.parseInt(query.page ?? '', 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(query.pageSize ?? '', 10) || DEFAULT_PAGE_SIZE));
  const sortField = SORTABLE_FIELDS[query.sortBy ?? ''] ?? 'importedAt';
  const sortDir: Prisma.SortOrder = query.sortDir === 'asc' ? 'asc' : 'desc';

  const filterClauses: Prisma.PaymentImportRecordWhereInput[] = [];
  if (query.filters) {
    try {
      const parsed: unknown = JSON.parse(query.filters);
      if (parsed && typeof parsed === 'object') {
        for (const [field, values] of Object.entries(parsed as Record<string, unknown>)) {
          if (!isFilterableField(field) || !Array.isArray(values) || values.length === 0) continue;
          const stringValues = values.filter((v): v is string => typeof v === 'string');
          if (stringValues.length === 0) continue;
          // Единственное на сейчас filterable-поле ('status') — Prisma-тип для него
          // строгий enum-фильтр, не голый string[]; значения уже провалидированы через
          // isFilterableField выше, приведение типов тут безопасно.
          filterClauses.push({ [field]: { in: stringValues } } as unknown as Prisma.PaymentImportRecordWhereInput);
        }
      }
    } catch {
      // Битый JSON в необязательном параметре — просто игнорируем фильтры.
    }
  }
  const where: Prisma.PaymentImportRecordWhereInput = filterClauses.length > 0 ? { AND: filterClauses } : {};

  const [rows, total] = await Promise.all([
    prisma.paymentImportRecord.findMany({
      where,
      orderBy: { [sortField]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        suggestedContract: { select: { id: true, number: true, resident: { select: { fullName: true } } } },
        matchedContract: { select: { id: true, number: true } },
      },
    }),
    prisma.paymentImportRecord.count({ where }),
  ]);

  const data = rows.map((row) => {
    const candidate = parsePaymentImportCandidate(row.rawPayload as Record<string, unknown>);
    return {
      id: row.id,
      status: row.status,
      externalId: row.externalId,
      importedAt: row.importedAt,
      amount: candidate.amount,
      paidAt: candidate.paidAt,
      contractorFio: candidate.contractorFio,
      comment: candidate.comment,
      suggestedContract: row.suggestedContract
        ? { id: row.suggestedContract.id, number: row.suggestedContract.number, residentFullName: row.suggestedContract.resident.fullName }
        : null,
      matchedContract: row.matchedContract ? { id: row.matchedContract.id, number: row.matchedContract.number } : null,
    };
  });

  return { data, total, page, pageSize };
}

const STATUS_LABELS_RU: Record<string, string> = {
  IMPORTED: 'Новый',
  MATCHED: 'Подтверждён',
  NEEDS_REVIEW: 'Ожидает подтверждения',
};
function facetLabel(field: FilterableField, value: string): string {
  return I18nContext.current()?.t(`paymentImports.status.${value}`) ?? STATUS_LABELS_RU[value] ?? value;
}

export async function paymentImportsFacetValues(prisma: PrismaService, field: string) {
  if (!isFilterableField(field)) return [];
  const rows = await prisma.paymentImportRecord.findMany({
    select: { [field]: true },
    distinct: [field as unknown as Prisma.PaymentImportRecordScalarFieldEnum],
    orderBy: { [field]: 'asc' },
    take: 500,
  });
  return rows.map((row) => {
    const value = (row as unknown as Record<string, string>)[field];
    return { value, label: facetLabel(field, value) };
  });
}
