import { Prisma } from '../../generated/prisma/client.js';
import { pickLatestContactInfo } from '../individuals/contact-info-priority';

// Типы ContactInfo, из которых берём адрес/телефон проживающего для печати — те же типы,
// что использует карточка физлица (см. contact-info-priority.ts).
const ADDRESS_TYPE = 'Адрес по прописке';
const PHONE_TYPE = 'Телефон мобильный';

export interface ResidentSnapshot {
  fullName: string;
  birthDate: string | null;
  snils: string | null;
  passportSeries: string | null;
  passportNumber: string | null;
  passportIssuedBy: string | null;
  passportIssuedCode: string | null;
  passportIssuedAt: string | null;
  address: string | null;
  phone: string | null;
  facultet: string | null;
  kursNumber: number | null;
  formObuch: string | null;
}

// Снимок личных данных проживающего на момент вызова — используется при создании
// договора (чтобы печать не "плыла" вслед за ночным синхроном 1С) и лениво при первой
// печати договора, созданного до этой фичи (см. contracts.controller.ts). Не хранимая
// сущность сама по себе — вызывающий код сам решает, класть ли результат в
// Contract.residentSnapshot.
export async function buildResidentSnapshot(
  prisma: Prisma.TransactionClient,
  residentIndividualUid: string,
): Promise<ResidentSnapshot> {
  const [individual, latestPassport, contactInfos, student] = await Promise.all([
    prisma.individual.findUniqueOrThrow({ where: { fizicheskoyeLitsoUid: residentIndividualUid } }),
    prisma.passport.findFirst({ where: { fizicheskoyeLitsoUid: residentIndividualUid }, orderBy: { period: 'desc' } }),
    prisma.contactInfo.findMany({ where: { fizicheskoyeLitsoUid: residentIndividualUid } }),
    prisma.student.findFirst({ where: { fizicheskoyeLitsoUid: residentIndividualUid } }),
  ]);

  const latestContacts = pickLatestContactInfo(contactInfos);
  const address = latestContacts.find((c) => c.type === ADDRESS_TYPE)?.predstavleniye ?? null;
  const phone = latestContacts.find((c) => c.type === PHONE_TYPE)?.phoneNumber ?? null;

  return {
    fullName: individual.fullName,
    birthDate: individual.birthDate?.toISOString() ?? null,
    snils: individual.snils ?? null,
    passportSeries: latestPassport?.series ?? null,
    passportNumber: latestPassport?.number ?? null,
    passportIssuedBy: latestPassport?.unit ?? null,
    passportIssuedCode: latestPassport?.codeUnit ?? null,
    passportIssuedAt: latestPassport?.dateStart?.toISOString() ?? null,
    address,
    phone,
    facultet: student?.facultet ?? null,
    kursNumber: student?.kursNumber ?? null,
    formObuch: student?.formObuch ?? null,
  };
}
