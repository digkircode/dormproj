import { z } from 'zod';

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
  DateStart: z.coerce.date(),
});

export type ContactInfoApiRecord = z.infer<typeof contactInfoApiRecordSchema>;
