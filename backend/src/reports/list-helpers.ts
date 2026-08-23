// Общий контракт списочных эндпоинтов (page/pageSize/search/sortBy/sortDir/filters →
// {data, total, page, pageSize}, см. lib/list-api.ts на фронте) — здесь та же форма,
// но применяется к уже посчитанному в памяти массиву (JOIN'ы отчётов собираются в JS
// поверх нескольких таблиц — RoomAssignment+Contract+Student+Citizenship и т.п. — не
// одним Prisma-запросом), а не транслируется в SQL where/orderBy/skip/take. На текущем
// объёме данных (один корпус, контингент — сотни, не десятки тысяч записей) это
// оправданный компромисс, тот же, что уже описан в промпте проекта про индексы.

export interface InMemoryListOptions {
  page: number;
  pageSize: number;
  search: string;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  filters: Record<string, string[]>;
}

export function parseListOptions(
  pageParam: string | undefined,
  pageSizeParam: string | undefined,
  searchParam: string | undefined,
  sortByParam: string | undefined,
  sortDirParam: string | undefined,
  filtersParam: string | undefined,
  defaultSortBy: string,
): InMemoryListOptions {
  const page = Math.max(1, Number.parseInt(pageParam ?? '', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(pageSizeParam ?? '', 10) || 20));
  const search = (searchParam ?? '').trim();
  const sortBy = sortByParam || defaultSortBy;
  const sortDir: 'asc' | 'desc' = sortDirParam === 'desc' ? 'desc' : 'asc';

  let filters: Record<string, string[]> = {};
  if (filtersParam) {
    try {
      const parsed: unknown = JSON.parse(filtersParam);
      if (parsed && typeof parsed === 'object') {
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (Array.isArray(value)) {
            filters[key] = value.filter((v): v is string => typeof v === 'string');
          }
        }
      }
    } catch {
      // Битый JSON в необязательном параметре — просто игнорируем фильтры, не 400'им весь запрос.
    }
  }

  return { page, pageSize, search, sortBy, sortDir, filters };
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'ru');
}

export interface ListPage<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// Общая часть paginateInMemory/filterAndSortInMemory — поиск+фильтры+сортировка без
// среза по странице, чтобы экспорт в Excel (см. excel-export.ts) мог получить ВСЕ
// отфильтрованные строки, а не только текущую страницу таблицы.
function filterAndSort<T extends object>(
  items: T[],
  options: InMemoryListOptions,
  config: {
    searchFields: (keyof T)[];
    sortableFields: (keyof T)[];
    filterFields?: (keyof T)[];
  },
): T[] {
  const get = (item: T, field: keyof T): unknown => (item as Record<string, unknown>)[field as string];

  let filtered = items;

  const q = options.search.toLowerCase();
  if (q) {
    filtered = filtered.filter((item) => config.searchFields.some((f) => String(get(item, f) ?? '').toLowerCase().includes(q)));
  }

  for (const [field, values] of Object.entries(options.filters)) {
    if (!values.length || !config.filterFields?.includes(field as keyof T)) continue;
    filtered = filtered.filter((item) => values.includes(String(get(item, field as keyof T) ?? '')));
  }

  const sortField = config.sortableFields.includes(options.sortBy as keyof T) ? (options.sortBy as keyof T) : config.sortableFields[0];
  return [...filtered].sort((a, b) => {
    const cmp = compareValues(get(a, sortField), get(b, sortField));
    return options.sortDir === 'desc' ? -cmp : cmp;
  });
}

export function paginateInMemory<T extends object>(
  items: T[],
  options: InMemoryListOptions,
  config: {
    searchFields: (keyof T)[];
    sortableFields: (keyof T)[];
    filterFields?: (keyof T)[];
  },
): ListPage<T> {
  const sorted = filterAndSort(items, options, config);
  const total = sorted.length;
  const start = (options.page - 1) * options.pageSize;
  return { data: sorted.slice(start, start + options.pageSize), total, page: options.page, pageSize: options.pageSize };
}

// То же самое, но без пагинации — для экспорта в Excel (см. excel-export.ts): весь
// отфильтрованный и отсортированный набор, каким бы он показался на всех страницах разом.
export function filterAndSortInMemory<T extends object>(
  items: T[],
  options: InMemoryListOptions,
  config: {
    searchFields: (keyof T)[];
    sortableFields: (keyof T)[];
    filterFields?: (keyof T)[];
  },
): T[] {
  return filterAndSort(items, options, config);
}

export interface FacetOption {
  value: string;
  label: string;
}

export function facetsFromValues(values: (string | number | null | undefined)[]): FacetOption[] {
  const unique = [...new Set(values.filter((v): v is string | number => v !== null && v !== undefined && v !== ''))].map((v) =>
    String(v),
  );
  unique.sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
  return unique.map((v) => ({ value: v, label: v }));
}
