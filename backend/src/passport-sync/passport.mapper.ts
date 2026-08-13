import type { PassportApiRecord } from './schemas/passport-api-record.schema';

export function toPassportData(record: PassportApiRecord) {
  return {
    fizicheskoyeLitsoUid: record.FizicheskoyeLitsoUID,
    period: record.Period,
    type: record.Type,
    series: record.Series,
    number: record.Number,
    dateStart: record.DateStart,
    unit: record.Unit,
    codeUnit: record.CodeUnit,
    systemDoc: record.SystemDoc,
  };
}
