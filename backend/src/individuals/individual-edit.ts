import { Prisma } from '../../generated/prisma/client.js';
import { pickLatestContactInfo } from './contact-info-priority';
import { sortPassportsByPriority } from './passport-priority';

// Типы ContactInfo, которые эта форма умеет редактировать — те же строковые ключи, что
// использует вся остальная карточка физлица (см. CONTACT_TYPE_ORDER на фронте,
// RESIDENCE_ADDRESS_TYPE/REGISTRATION_ADDRESS_TYPE в resident-snapshot.ts).
export const BIRTH_PLACE_TYPE = 'Место рождения';
export const REGISTRATION_ADDRESS_TYPE = 'Адрес по прописке';
export const RESIDENCE_ADDRESS_TYPE = 'Адрес места проживания';
export const PHONE_TYPE = 'Телефон мобильный';
export const EMAIL_TYPE = 'Email';

const DEFAULT_PASSPORT_TYPE = 'Паспорт РФ';

// "Критическая правка" физлица (STAFF/ADMIN) — по прямой просьбе 2026-08-23 пишет ПРЯМО
// в те же таблицы, что заполняет ночной синхрон 1С (ContactInfo/Passport/Citizenship),
// а не в отдельные manual-поля Individual (как форма "Новое физическое лицо" — там это
// осознанно было наоборот, см. schema.prisma). Разворот сознательный: это аварийный
// костыль для критических ситуаций, следующий ночной синхрон синхронизируемых физлиц
// перезапишет эти значения обратно из 1С — и это нормально, не баг.
//
// Стратегия — обновить ту же запись, что уже показывается как "актуальная" (по тем же
// правилам приоритета, что и карточка/печать, см. pickLatestContactInfo/
// sortPassportsByPriority), не создавать вторую вперемешку с первой. Если такой записи
// нет вообще (чисто ручное физлицо без единой синхронной строки) — создаём новую,
// технические 1С-поля (xml/json/systemDoc и т.п.), не имеющие смысла для ручного ввода,
// заполняются пустой строкой.

export async function upsertContactInfo(
  tx: Prisma.TransactionClient,
  uid: string,
  type: string,
  predstavleniye: string,
  extra: { phoneNumber?: string; phoneNumberNoCode?: string; email?: string } = {},
): Promise<void> {
  const rows = await tx.contactInfo.findMany({ where: { fizicheskoyeLitsoUid: uid, type } });
  const latest = pickLatestContactInfo(rows)[0];
  if (latest) {
    await tx.contactInfo.update({ where: { id: latest.id }, data: { predstavleniye, ...extra } });
    return;
  }
  await tx.contactInfo.create({
    data: {
      fizicheskoyeLitsoUid: uid,
      type,
      predstavleniye,
      xml: '',
      json: '',
      country: '',
      region: '',
      city: '',
      email: extra.email ?? '',
      phoneNumber: extra.phoneNumber ?? '',
      phoneNumberNoCode: extra.phoneNumberNoCode ?? '',
      dateStart: new Date(),
    },
  });
}

// Удаляет запись типа type, если она есть — для случая, когда сотрудник очистил поле
// в форме (не оставлять на карточке значение, от которого явно отказались).
export async function deleteContactInfoIfExists(tx: Prisma.TransactionClient, uid: string, type: string): Promise<void> {
  const rows = await tx.contactInfo.findMany({ where: { fizicheskoyeLitsoUid: uid, type } });
  const latest = pickLatestContactInfo(rows)[0];
  if (latest) {
    await tx.contactInfo.delete({ where: { id: latest.id } });
  }
}

export async function upsertPassport(
  tx: Prisma.TransactionClient,
  uid: string,
  data: { series: string | null; number: string; issuedBy: string | null; issuedCode: string | null; issuedAt: Date },
): Promise<void> {
  const rows = await tx.passport.findMany({ where: { fizicheskoyeLitsoUid: uid } });
  const latest = sortPassportsByPriority(rows)[0];
  const fields = {
    series: data.series ?? '',
    number: data.number,
    unit: data.issuedBy ?? '',
    codeUnit: data.issuedCode ?? '',
    dateStart: data.issuedAt,
  };
  if (latest) {
    await tx.passport.update({ where: { id: latest.id }, data: fields });
    return;
  }
  await tx.passport.create({
    data: {
      fizicheskoyeLitsoUid: uid,
      type: DEFAULT_PASSPORT_TYPE,
      period: data.issuedAt,
      systemDoc: '',
      ...fields,
    },
  });
}

export async function upsertCitizenship(tx: Prisma.TransactionClient, uid: string, country: string): Promise<void> {
  const latest = await tx.citizenship.findFirst({ where: { fizicheskoyeLitsoUid: uid }, orderBy: { period: 'desc' } });
  if (latest) {
    await tx.citizenship.update({ where: { id: latest.id }, data: { country, countryCode: '' } });
    return;
  }
  await tx.citizenship.create({ data: { fizicheskoyeLitsoUid: uid, period: new Date(), country, countryCode: '' } });
}

// Снимок текущих значений редактируемых полей — та же логика приоритета, что и у
// карточки физлица (detail()), плоским набором для формы правки и для diff'а в истории
// изменений (audit log). Не путать с ResidentSnapshot (contracts/resident-snapshot.ts) —
// тот замороженный на момент подписания договора, этот — всегда живой.
export interface EditableIndividualSnapshot {
  fullName: string;
  surname: string | null;
  name: string | null;
  otchestvo: string | null;
  birthDate: string | null;
  gender: string | null;
  citizenship: string | null;
  birthPlace: string | null;
  registrationAddress: string | null;
  residenceAddress: string | null;
  phone: string | null;
  email: string | null;
  snils: string | null;
  inn: string | null;
  passportSeries: string | null;
  passportNumber: string | null;
  passportIssuedBy: string | null;
  passportIssuedCode: string | null;
  passportIssuedAt: string | null;
}

export async function buildEditableSnapshot(tx: Prisma.TransactionClient, uid: string): Promise<EditableIndividualSnapshot> {
  const [individual, citizenship, contactInfos, passports] = await Promise.all([
    tx.individual.findUniqueOrThrow({ where: { fizicheskoyeLitsoUid: uid } }),
    tx.citizenship.findFirst({ where: { fizicheskoyeLitsoUid: uid }, orderBy: { period: 'desc' } }),
    tx.contactInfo.findMany({ where: { fizicheskoyeLitsoUid: uid } }),
    tx.passport.findMany({ where: { fizicheskoyeLitsoUid: uid } }),
  ]);

  const latestContacts = pickLatestContactInfo(contactInfos);
  const latestPassport = sortPassportsByPriority(passports)[0] ?? null;
  const findContact = (type: string) => latestContacts.find((c) => c.type === type)?.predstavleniye ?? null;

  return {
    fullName: individual.fullName,
    surname: individual.surname,
    name: individual.name,
    otchestvo: individual.otchestvo,
    birthDate: individual.birthDate?.toISOString() ?? null,
    gender: individual.gender,
    citizenship: citizenship?.country ?? individual.citizenship ?? null,
    birthPlace: findContact(BIRTH_PLACE_TYPE),
    registrationAddress: findContact(REGISTRATION_ADDRESS_TYPE),
    residenceAddress: findContact(RESIDENCE_ADDRESS_TYPE),
    phone: findContact(PHONE_TYPE) ?? individual.phone ?? null,
    email: findContact(EMAIL_TYPE) ?? individual.email ?? null,
    snils: individual.snils,
    inn: individual.inn,
    passportSeries: latestPassport?.series ?? null,
    passportNumber: latestPassport?.number ?? null,
    passportIssuedBy: latestPassport?.unit ?? null,
    passportIssuedCode: latestPassport?.codeUnit ?? null,
    passportIssuedAt: latestPassport?.dateStart?.toISOString() ?? null,
  };
}
