// "Актуальный" документ, удостоверяющий личность — не просто самый свежий по дате:
// паспорт РФ должен перевешивать военный билет/вид на жительство/etc., даже если тот
// оформлен позже (например, военный билет получили после паспорта). Список — реальные
// значения Passport.type из 1С на момент написания (см. `SELECT type, count(*) FROM
// passports GROUP BY type`); что не попало в список — считается низкоприоритетным.
// Экспортируется отдельно, т.к. эта же логика понадобится для договоров.
const TYPE_PRIORITY: Record<string, number> = {
  'Паспорт РФ': 0,
  'Заграничный паспорт РФ': 1,
  'Заграничный паспорт гражданина Российской Федерации': 1,
  'Паспорт иностранного гражданина': 2,
  'Удостоверение личности (Республика Казахстан)': 3,
  'Удостоверение личности (Республика Узбекистан)': 3,
  'Вид на жительство': 4,
  'Военный билет': 5,
  'Иной документ удостоверяющий личность': 6,
};

function typePriority(type: string): number {
  return TYPE_PRIORITY[type] ?? 10;
}

export interface PassportLike {
  type: string;
  dateStart: Date;
  period: Date;
  id: number;
}

// Сортирует так, что первый элемент — актуальный документ: сначала по приоритету типа,
// внутри одного типа — по дате выдачи (потом period/id как тай-брейкеры для совсем
// одинаковых дат), обе по убыванию.
export function sortPassportsByPriority<T extends PassportLike>(passports: T[]): T[] {
  return [...passports].sort((a, b) => {
    const priorityDiff = typePriority(a.type) - typePriority(b.type);
    if (priorityDiff !== 0) return priorityDiff;
    const dateStartDiff = b.dateStart.getTime() - a.dateStart.getTime();
    if (dateStartDiff !== 0) return dateStartDiff;
    const periodDiff = b.period.getTime() - a.period.getTime();
    if (periodDiff !== 0) return periodDiff;
    return b.id - a.id;
  });
}
