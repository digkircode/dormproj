import type { ContactInfoApiRecord } from './schemas/contact-info-api-record.schema';

export function toContactInfoData(record: ContactInfoApiRecord) {
  return {
    fizicheskoyeLitsoUid: record.FizicheskoyeLitsoUID,
    type: record.Type,
    predstavleniye: record.Predstavleniye,
    xml: record.XML,
    json: record.JSON,
    country: record.Country,
    region: record.Region,
    city: record.City,
    email: record.email,
    phoneNumber: record.PhoneNumber,
    phoneNumberNoCode: record.PhoneNumberNoCode,
    dateStart: record.DateStart,
  };
}
