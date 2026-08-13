import type { CitizenshipApiRecord } from './schemas/citizenship-api-record.schema';

export function toCitizenshipData(record: CitizenshipApiRecord) {
  return {
    fizicheskoyeLitsoUid: record.FizicheskoyeLitsoUID,
    period: record.Period,
    country: record.Country,
    countryCode: record.CountryCode,
  };
}
