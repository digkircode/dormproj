import { Prisma } from '../../generated/prisma/client.js';
import type { ResidentSnapshot } from './resident-snapshot';

const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

function formatDateShort(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

// Заменяет собой ВЕСЬ блок «__»_______________202_ г. в шапке бланка (включая кавычки
// и "г.") — не завязываемся на захардкоженный в оригинале "202_" (не переживёт другое
// десятилетие).
function formatDateLong(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  return `«${d.getDate()}» ${MONTHS_GENITIVE[d.getMonth()]} ${d.getFullYear()} г.`;
}

function formatMoney(value: Prisma.Decimal | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return `${Number(value).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} руб.`;
}

// "кем и когда выдан" одной строкой — в бланке это одна ячейка/подпись под паспортными
// данными, разносить на отдельные теги смысла нет, всё равно печатается вместе.
function formatIssuedInfo(issuedBy: string | null, issuedCode: string | null, issuedAt: Date | string | null): string {
  const parts = [issuedBy, issuedCode ? `код ${issuedCode}` : null, formatDateShort(issuedAt) || null].filter(Boolean);
  return parts.join(', ');
}

function formatInstituteCourse(facultet: string | null, kursNumber: number | null): string {
  const parts = [facultet, kursNumber ? `${kursNumber} курс` : null].filter(Boolean);
  return parts.join(', ');
}

interface ContractLike {
  number: string;
  contractDate: Date;
  startDate: Date;
  endDate: Date;
  legalRepName: string | null;
  legalRepPhone: string | null;
  legalRepBirthDate: Date | null;
  legalRepPassportSeries: string | null;
  legalRepPassportNumber: string | null;
  legalRepPassportIssuedBy: string | null;
  legalRepPassportIssuedCode: string | null;
  legalRepPassportIssuedAt: Date | null;
  legalRepSnils: string | null;
  legalRepAddress: string | null;
  matCapitalCoveredFrom: Date | null;
  matCapitalCoveredTo: Date | null;
  matCapitalAmount: Prisma.Decimal | null;
}

interface TermsLike {
  rentAmount: Prisma.Decimal;
  utilitiesAmount: Prisma.Decimal;
  dailyRateAmount: Prisma.Decimal;
}

// Плоский набор {tag} -> строка для docxtemplater — единый и для обычного бланка (там
// "Наниматель" = сам проживающий, легалреп — только информационная строка ФИО+телефон),
// и для бланка несовершеннолетних (там "Наниматель" = родитель, "Проживающий" = резидент).
// Незаполненные теги отдаются пустой строкой — docxtemplater иначе падает на unresolved tag.
export function buildDocumentData(
  contract: ContractLike,
  resident: ResidentSnapshot,
  terms: TermsLike | undefined,
  room: { room: string } | null,
): Record<string, string> {
  const matCapitalText =
    contract.matCapitalCoveredFrom && contract.matCapitalCoveredTo && contract.matCapitalAmount !== null
      ? `за период с ${formatDateShort(contract.matCapitalCoveredFrom)} по ${formatDateShort(contract.matCapitalCoveredTo)} в сумме ${formatMoney(contract.matCapitalAmount)}`
      : '—';

  return {
    number: contract.number,
    contractDateLong: formatDateLong(contract.contractDate),
    startDateShort: formatDateShort(contract.startDate),
    endDateShort: formatDateShort(contract.endDate),
    roomName: room?.room ?? '',

    rentAmount: terms ? formatMoney(terms.rentAmount) : '',
    utilitiesAmount: terms ? formatMoney(terms.utilitiesAmount) : '',
    totalMonthly: terms ? formatMoney(terms.rentAmount.plus(terms.utilitiesAmount)) : '',
    dailyRateAmount: terms ? formatMoney(terms.dailyRateAmount) : '',

    residentFullName: resident.fullName,
    residentBirthDateShort: formatDateShort(resident.birthDate),
    residentPassportSeries: resident.passportSeries ?? '',
    residentPassportNumber: resident.passportNumber ?? '',
    residentPassportIssuedInfo: formatIssuedInfo(resident.passportIssuedBy, resident.passportIssuedCode, resident.passportIssuedAt),
    residentAddress: resident.address ?? '',
    residentSnils: resident.snils ?? '',
    residentPhone: resident.phone ?? '',
    residentInstituteCourse: formatInstituteCourse(resident.facultet, resident.kursNumber),
    residentFormObuch: resident.formObuch ?? '',

    legalRepFullName: contract.legalRepName ?? '',
    legalRepPhone: contract.legalRepPhone ?? '',
    legalRepNameAndPhone: [contract.legalRepName, contract.legalRepPhone].filter(Boolean).join(', '),
    legalRepBirthDateShort: formatDateShort(contract.legalRepBirthDate),
    legalRepPassportSeries: contract.legalRepPassportSeries ?? '',
    legalRepPassportNumber: contract.legalRepPassportNumber ?? '',
    legalRepPassportIssuedInfo: formatIssuedInfo(
      contract.legalRepPassportIssuedBy,
      contract.legalRepPassportIssuedCode,
      contract.legalRepPassportIssuedAt,
    ),
    legalRepAddress: contract.legalRepAddress ?? '',
    legalRepSnils: contract.legalRepSnils ?? '',

    matCapitalText,
  };
}
