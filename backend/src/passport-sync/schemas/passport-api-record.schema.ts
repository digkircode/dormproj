import { z } from 'zod';

export const passportApiRecordSchema = z.object({
  FizicheskoyeLitsoUID: z.uuid(),
  Period: z.coerce.date(),
  Type: z.string(),
  Series: z.string(),
  Number: z.string(),
  DateStart: z.coerce.date(),
  Unit: z.string(),
  CodeUnit: z.string(),
  SystemDoc: z.string(),
});

export type PassportApiRecord = z.infer<typeof passportApiRecordSchema>;
