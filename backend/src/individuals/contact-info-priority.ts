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
