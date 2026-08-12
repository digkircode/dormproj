import { z } from 'zod';

// Форма одной записи из внешнего REST API 1С со списком активных студентов.
// Описательные поля в реальных данных иногда приходят пустой строкой (непроставленная
// группа у свежих первокурсников, незабэкфиленное основание обучения у старых записей) —
// это легитимные случаи, такие записи всё равно должны попасть в базу. Строго проверяем
// только структурные поля: оба UID (по ним идёт апсерт и связка), Period, KursNumber, DOT.
export const studentApiRecordSchema = z.object({
  Period: z.coerce.date(),
  FizicheskoyeLitso: z.string(),
  FizicheskoyeLitsoUID: z.uuid(),
  ZachetnayaKniga: z.string(),
  ZachetnayaKnigaUID: z.uuid(),
  UchebYear: z.string(),
  UchebPlan: z.string(),
  UchebPlanOsnova: z.string(),
  FormObuch: z.string(),
  Facultet: z.string(),
  Speciality: z.string(),
  Kurs: z.string(),
  KursNumber: z.number().int(),
  Group: z.string(),
  UchebStatus: z.string(),
  OsnovaObuch: z.string(),
  UrovenPodgotov: z.string(),
  ProfilSpec: z.string().nullish(),
  DOT: z.boolean(),
  FacultAbbr: z.string(),
});

export type StudentApiRecord = z.infer<typeof studentApiRecordSchema>;
