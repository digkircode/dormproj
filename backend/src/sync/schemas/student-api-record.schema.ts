import { z } from 'zod';

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
