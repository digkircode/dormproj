// "Актуальная" контактная информация одного типа — правило, а не готовая чистка данных.
// Источник на один Type может отдать несколько строк на человека: дубли того же значения
// в разных форматах записи, устаревшие записи, полностью незаполненные. country/region/city
// по факту ненадёжны: интерактивный выбор адреса из КЛАДР в 1С заполняет их структурированно,
// ручной ввод строкой (или интеграция из другой системы) — не всегда, автопарсинг из
// predstavleniye срабатывает через раз. Поэтому их заполненность — тай-брейк, а не основной
// сигнал. dateStart по тем же причинам условно надёжен: "0001-01-01" — сентинел 1С для
// "дата не задана" (не NULL), а будущие даты для поля "начало действия" тоже подозрительны —
// обе категории уходят в конец сортировки наравне с по-настоящему пустыми записями.
// XML/JSON (КЛАДР-структура) сюда сознательно не участвуют — см. схему в schema.prisma:
// в них может быть как валидная разбивка, так и мусор от парсинга произвольной строки,
// разбирать их — отдельная будущая задача (нормализация во время синхрона).
const TYPE_ORDER = ['Место рождения', 'Адрес по прописке', 'Адрес места проживания', 'Телефон мобильный', 'Email'];

export interface ContactInfoLike {
  id: number;
  type: string;
  dateStart: Date;
  country: string;
  region: string;
  city: string;
}

function hasReliableDate(dateStart: Date): boolean {
  return dateStart.getFullYear() > 1 && dateStart.getTime() <= Date.now();
}

function filledFieldCount(record: ContactInfoLike): number {
  return [record.country, record.region, record.city].filter((v) => v.trim() !== '').length;
}

function compareByPriority(a: ContactInfoLike, b: ContactInfoLike): number {
  const aReliable = hasReliableDate(a.dateStart);
  const bReliable = hasReliableDate(b.dateStart);
  if (aReliable !== bReliable) return aReliable ? -1 : 1;
  if (aReliable) {
    const dateDiff = b.dateStart.getTime() - a.dateStart.getTime();
    if (dateDiff !== 0) return dateDiff;
  }
  const filledDiff = filledFieldCount(b) - filledFieldCount(a);
  if (filledDiff !== 0) return filledDiff;
  return b.id - a.id;
}

// На карточке физлица должен быть ровно один (самый актуальный) ряд на каждый встретившийся
// Type. Схлопывает дубли внутри типа и возвращает по одной записи на тип, в удобном для
// чтения порядке: известные типы — в фиксированном порядке, остальные — по алфавиту следом
// (на случай, если источник когда-нибудь добавит новый Type).
export function pickLatestContactInfo<T extends ContactInfoLike>(records: T[]): T[] {
  const byType = new Map<string, T[]>();
  for (const record of records) {
    const bucket = byType.get(record.type);
    if (bucket) bucket.push(record);
    else byType.set(record.type, [record]);
  }

  const latest = [...byType.values()].map((group) => [...group].sort(compareByPriority)[0]);

  return latest.sort((a, b) => {
    const aIdx = TYPE_ORDER.indexOf(a.type);
    const bIdx = TYPE_ORDER.indexOf(b.type);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return a.type.localeCompare(b.type, 'ru');
  });
}
