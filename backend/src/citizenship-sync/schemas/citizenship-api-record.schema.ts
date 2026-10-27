import { z } from 'zod';

export const citizenshipApiRecordSchema = z.object({
  FizicheskoyeLitsoUID: z.uuid(),
  Period: z.coerce.date(),
  Country: z.string(),
  CountryCode: z.string(),
});

export type CitizenshipApiRecord = z.infer<typeof citizenshipApiRecordSchema>;
