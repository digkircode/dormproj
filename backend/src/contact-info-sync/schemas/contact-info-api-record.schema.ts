import { z } from 'zod';

// Форма одной записи из внешнего REST API 1С с контактной информацией (адреса,
// телефоны, email, место рождения — всё через один и тот же Type). Нет собственного
// UID записи — только связь с физлицом (FizicheskoyeLitsoUID).
export const contactInfoApiRecordSchema = z.object({
  FizicheskoyeLitsoUID: z.uuid(),
  Type: z.string(),
  Predstavleniye: z.string(),
  XML: z.string(),
  Country: z.string(),
  Region: z.string(),
  City: z.string(),
  email: z.string(),
  PhoneNumber: z.string(),
  PhoneNumberNoCode: z.string(),
  JSON: z.string(),
  // 1С отдаёт "0001-01-01T00:00:00" как "дата не задана" вместо null — обычная
  // валидная дата с точки зрения парсинга, просто семантически "пусто".
  DateStart: z.coerce.date(),
});

export type ContactInfoApiRecord = z.infer<typeof contactInfoApiRecordSchema>;
