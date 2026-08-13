import type { IndividualApiRecord } from './schemas/individual-api-record.schema';

export function toIndividualData(record: IndividualApiRecord) {
  return {
    deleteMark: record.DeleteMark,
    code: record.Code,
    fullName: record.FullName,
    surname: record.Surname,
    name: record.Name,
    otchestvo: record.Otchestvo,
    gender: record.Gender,
    birthDate: record.BirthDate,
    inn: record.INN,
    snils: record.SNILS,
    photoCode: record.PhotoCode,
  };
}
