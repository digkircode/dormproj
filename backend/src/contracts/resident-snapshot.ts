import { Prisma } from '../../generated/prisma/client.js';
import { pickLatestContactInfo } from '../individuals/contact-info-priority';

const RESIDENCE_ADDRESS_TYPE = 'Адрес места проживания';
const REGISTRATION_ADDRESS_TYPE = 'Адрес по прописке';
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
  const address =
    latestContacts.find((c) => c.type === RESIDENCE_ADDRESS_TYPE)?.predstavleniye ??
    latestContacts.find((c) => c.type === REGISTRATION_ADDRESS_TYPE)?.predstavleniye ??
    individual.address ??
    null;
  const phone = latestContacts.find((c) => c.type === PHONE_TYPE)?.phoneNumber ?? individual.phone ?? null;

  return {
    fullName: individual.fullName,
    birthDate: individual.birthDate?.toISOString() ?? null,
    snils: individual.snils ?? null,
    passportSeries: latestPassport?.series ?? individual.passportSeries ?? null,
    passportNumber: latestPassport?.number ?? individual.passportNumber ?? null,
    passportIssuedBy: latestPassport?.unit ?? individual.passportIssuedBy ?? null,
    passportIssuedCode: latestPassport?.codeUnit ?? individual.passportIssuedCode ?? null,
    passportIssuedAt: (latestPassport?.dateStart ?? individual.passportIssuedAt)?.toISOString() ?? null,
    address,
    phone,
    facultet: student?.facultet ?? null,
    kursNumber: student?.kursNumber ?? null,
    formObuch: student?.formObuch ?? null,
  };
}

export function fillManualFallbacks(
  snapshot: ResidentSnapshot,
  individual: {
    phone: string | null;
    address: string | null;
    passportSeries: string | null;
    passportNumber: string | null;
    passportIssuedBy: string | null;
    passportIssuedCode: string | null;
    passportIssuedAt: Date | null;
  },
): ResidentSnapshot {
  return {
    ...snapshot,
    phone: snapshot.phone ?? individual.phone ?? null,
    address: snapshot.address ?? individual.address ?? null,
    passportSeries: snapshot.passportSeries ?? individual.passportSeries ?? null,
    passportNumber: snapshot.passportNumber ?? individual.passportNumber ?? null,
    passportIssuedBy: snapshot.passportIssuedBy ?? individual.passportIssuedBy ?? null,
    passportIssuedCode: snapshot.passportIssuedCode ?? individual.passportIssuedCode ?? null,
    passportIssuedAt: snapshot.passportIssuedAt ?? individual.passportIssuedAt?.toISOString() ?? null,
  };
}
