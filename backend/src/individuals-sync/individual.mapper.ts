import type { IndividualApiRecord } from './schemas/individual-api-record.schema';

export function toIndividualData(record: IndividualApiRecord) {
  return {
    // Явно, а не только через дефолт схемы: если запись раньше была заведена вручную
    // и теперь подтверждена синхроном (человек стал реальным студентом), снимаем флаг —
    // дальше она должна и дальше попадать в синхрон, даже если из students потом пропадёт.
    isManual: false,
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
