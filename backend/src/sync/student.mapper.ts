import type { StudentApiRecord } from './schemas/student-api-record.schema';

export function toStudentData(record: StudentApiRecord) {
  return {
    fizicheskoyeLitsoUid: record.FizicheskoyeLitsoUID,
    fullName: record.FizicheskoyeLitso,
    zachetnayaKniga: record.ZachetnayaKniga,
    uchebYear: record.UchebYear,
    uchebPlan: record.UchebPlan,
    uchebPlanOsnova: record.UchebPlanOsnova,
    formObuch: record.FormObuch,
    facultet: record.Facultet,
    speciality: record.Speciality,
    kurs: record.Kurs,
    kursNumber: record.KursNumber,
    group: record.Group,
    uchebStatus: record.UchebStatus,
    osnovaObuch: record.OsnovaObuch,
    urovenPodgotov: record.UrovenPodgotov,
    profilSpec: record.ProfilSpec ?? null,
    dot: record.DOT,
    facultAbbr: record.FacultAbbr,
    period: record.Period,
  };
}
