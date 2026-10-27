import { z } from 'zod';

export const individualApiRecordSchema = z.object({
  FizicheskoyeLitsoUID: z.uuid(),
  DeleteMark: z.boolean(),
  Code: z.string(),
  FullName: z.string(),
  Surname: z.string(),
  Name: z.string(),
  Otchestvo: z.string(),
  Gender: z.string(),
  BirthDate: z.coerce.date(),
  INN: z.string(),
  SNILS: z.string(),
  PhotoCode: z.string(),
});

export type IndividualApiRecord = z.infer<typeof individualApiRecordSchema>;
