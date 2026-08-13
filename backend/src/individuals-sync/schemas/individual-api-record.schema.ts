import { z } from 'zod';

// Форма одной записи из внешнего REST API 1С с данными физлица. Тот же принцип, что
// и у студентов: структурные поля (UID, DeleteMark, BirthDate) — строгие, описательные
// текстовые поля — мягкие (z.string()), чтобы легитимно пустые значения не роняли запись.
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
