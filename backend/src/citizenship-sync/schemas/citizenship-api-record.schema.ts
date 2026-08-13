import { z } from 'zod';

// Форма одной записи из внешнего REST API 1С с историей гражданства. Нет собственного
// UID записи — только связь с физлицом (FizicheskoyeLitsoUID) и период.
export const citizenshipApiRecordSchema = z.object({
  FizicheskoyeLitsoUID: z.uuid(),
  Period: z.coerce.date(),
  Country: z.string(),
  CountryCode: z.string(),
});

export type CitizenshipApiRecord = z.infer<typeof citizenshipApiRecordSchema>;
