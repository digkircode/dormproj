import { Prisma } from '../../generated/prisma/client.js';
import { pickLatestContactInfo } from '../individuals/contact-info-priority';

// Типы ContactInfo, из которых берём адрес/телефон проживающего для печати — те же типы,
// что использует карточка физлица (см. contact-info-priority.ts). Адрес места жительства —
// в приоритете над адресом по прописке (обычно это фактическое место проживания
// проживающего, прописка — только запасной вариант, если первого нет).
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
  // Адрес — место жительства, если есть, иначе прописка, иначе (для isManual-физлиц, у
  // которых обеих строк ContactInfo нет вообще) ручное поле Individual.address — та же
  // роль, что оно уже играет как фолбэк "Адреса по прописке" на карточке физлица
  // (см. MANUAL_CONTACT_FALLBACK в IndividualDetail.vue).
  const address =
    latestContacts.find((c) => c.type === RESIDENCE_ADDRESS_TYPE)?.predstavleniye ??
    latestContacts.find((c) => c.type === REGISTRATION_ADDRESS_TYPE)?.predstavleniye ??
    individual.address ??
    null;
  // Телефон/паспорт — та же история: у физлиц, заведённых вручную (isManual, включая
  // автосозданного родителя несовершеннолетнего), нет ни ContactInfo, ни Passport — данные
  // введены прямо в Individual (см. миграцию individual_manual_fields), печать раньше их
  // не читала вообще, отсюда пустые "Контактный телефон"/паспортные поля в бланке.
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

// Договоры, созданные ДО фикса isManual-фолбэка выше (2026-08-23), уже хранят снимок с
// пустыми phone/адресом/паспортом навсегда — Contract.residentSnapshot не пересчитывается
// на новую печать (сознательный дизайн, см. buildResidentSnapshot). Пересобирать снимок
// целиком для них не нужно (это бы "поплыло" остальными полями от текущих данных), но
// именно эти конкретные пустые поля можно безопасно дозаполнить текущими значениями
// Individual при каждой печати — не трогая уже сохранённый JSON в БД. См. contracts.controller.ts#document.
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
