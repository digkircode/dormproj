import { Prisma } from '../../generated/prisma/client.js';
import type { ResidentSnapshot } from './resident-snapshot';
import { formatRublesDigits, rublesCurrencyWord, rublesInWords, splitRublesAndKopecks } from './money-to-words';

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

function formatDateLong(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  return `«${d.getDate()}» ${MONTHS_GENITIVE[d.getMonth()]} ${d.getFullYear()} г.`;
}

function formatMoney(value: Prisma.Decimal | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return `${Number(value).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} руб.`;
}

function formatIssuedInfo(issuedBy: string | null, issuedCode: string | null, issuedAt: Date | string | null): string {
  const dateShort = formatDateShort(issuedAt);
  const parts = [issuedBy, issuedCode ? `КП: ${issuedCode}` : null, dateShort ? `Дата: ${dateShort}` : null].filter(Boolean);
  return parts.join(', ');
}

function formatIssuedCodeDateLine(issuedCode: string | null, issuedAt: Date | string | null): string {
  const dateShort = formatDateShort(issuedAt);
  const parts = [issuedCode ? `КП: ${issuedCode}` : null, dateShort ? `Дата: ${dateShort}` : null].filter(Boolean);
  return parts.join(', ');
}

function formatCourseLine(kursNumber: number | null): string {
  return kursNumber ? `${kursNumber} курс` : '';
}

function splitSurnameRest(fullName: string): { surname: string; rest: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { surname: '', rest: '' };
  return { surname: parts[0], rest: parts.slice(1).join(' ') };
}

function splitAddressTwoLines(address: string, maxLineLength = 40): { line1: string; line2: string } {
  const trimmed = address.trim();
  if (trimmed.length <= maxLineLength) return { line1: trimmed, line2: '' };
  const words = trimmed.split(/\s+/);
  let line1 = '';
  let i = 0;
  for (; i < words.length; i++) {
    const candidate = line1 ? `${line1} ${words[i]}` : words[i];
    if (candidate.length > maxLineLength && line1) break;
    line1 = candidate;
  }
  return { line1, line2: words.slice(i).join(' ') };
}

function moneyBreakdown(value: Prisma.Decimal): { digits: string; words: string; currency: string; kopecksText: string } {
  const { rubles, kopecksText } = splitRublesAndKopecks(value);
  return { digits: formatRublesDigits(rubles), words: rublesInWords(rubles), currency: rublesCurrencyWord(rubles), kopecksText };
}

export function surnameWithInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const [surname, ...rest] = parts;
  const initials = rest.map((p) => `${p.charAt(0).toUpperCase()}.`).join('');
  return initials ? `${surname} ${initials}` : surname;
}

function formatRussianPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  const normalized = digits.length === 11 && digits.startsWith('8') ? `7${digits.slice(1)}` : digits;
  if (normalized.length !== 11 || !normalized.startsWith('7')) return phone;
  const code = normalized.slice(1, 4);
  const part1 = normalized.slice(4, 7);
  const part2 = normalized.slice(7, 9);
  const part3 = normalized.slice(9, 11);
  return `+7 (${code}) ${part1}-${part2}-${part3}`;
}

interface ContractLike {
  number: string;
  contractDate: Date;
  startDate: Date;
  endDate: Date;
  residenceReason: string | null;
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
  matCapitalDeferredUntil: Date | null;
}

interface TermsLike {
  rentAmount: Prisma.Decimal;
  utilitiesAmount: Prisma.Decimal;
  dailyRateAmount: Prisma.Decimal;
  dailyRateCategory: string;
}

export function buildDocumentData(
  contract: ContractLike,
  resident: ResidentSnapshot,
  terms: TermsLike | undefined,
  room: { room: string } | null,
  communalServicesCost: Prisma.Decimal | null,
): Record<string, string | boolean> {
  const isOwnUniversity = terms?.dailyRateCategory === 'OWN_UNIVERSITY';
  const residenceReasonText = isOwnUniversity
    ? 'обучением в АНО ВО «РосНОУ»'
    : contract.residenceReason
      ? `«${contract.residenceReason}»`
      : '';

  const emptyBreakdown = { digits: '', words: '', currency: '', kopecksText: '' };
  const isLegacyCombinedAmount = !!terms && terms.utilitiesAmount.isZero() && terms.rentAmount.greaterThan(0);
  const legacyUtilities = isLegacyCombinedAmount && communalServicesCost
    ? (communalServicesCost.lessThan(terms.rentAmount) ? communalServicesCost : terms.rentAmount)
    : new Prisma.Decimal(0);
  const rentForDoc = terms ? (isLegacyCombinedAmount ? terms.rentAmount.minus(legacyUtilities) : terms.rentAmount) : new Prisma.Decimal(0);
  const utilitiesForDoc = terms ? (isLegacyCombinedAmount ? legacyUtilities : terms.utilitiesAmount) : new Prisma.Decimal(0);
  const rent = terms ? moneyBreakdown(rentForDoc) : emptyBreakdown;
  const utilities = terms ? moneyBreakdown(utilitiesForDoc) : emptyBreakdown;
  const total = terms ? moneyBreakdown(terms.rentAmount.plus(terms.utilitiesAmount)) : emptyBreakdown;

  const residentName = splitSurnameRest(resident.fullName);
  const legalRepNameSplit = splitSurnameRest(contract.legalRepName ?? '');
  const residentCourseLine = formatCourseLine(resident.kursNumber);
  const residentFacultetLine = resident.facultet ?? '';
  const residentAddressSplit = splitAddressTwoLines(resident.address ?? '');
  const legalRepAddressSplit = splitAddressTwoLines(contract.legalRepAddress ?? '');

  return {
    number: contract.number,
    contractDateLong: formatDateLong(contract.contractDate),
    startDateShort: formatDateShort(contract.startDate),
    endDateShort: formatDateShort(contract.endDate),
    roomName: room?.room ?? '',

    isOwnUniversity,
    residenceReasonText,

    rentAmount: rent.digits,
    rentAmountWords: rent.words,
    rentAmountCurrency: rent.currency,
    rentAmountKopecks: rent.kopecksText,
    utilitiesAmount: utilities.digits,
    utilitiesAmountWords: utilities.words,
    utilitiesAmountCurrency: utilities.currency,
    utilitiesAmountKopecks: utilities.kopecksText,
    totalMonthly: total.digits,
    totalMonthlyWords: total.words,
    totalMonthlyCurrency: total.currency,
    totalMonthlyKopecks: total.kopecksText,
    dailyRateAmount: terms ? formatMoney(terms.dailyRateAmount) : '',

    residentFullName: resident.fullName,
    residentFullNameShort: surnameWithInitials(resident.fullName),
    residentFullNameSurname: residentName.surname,
    residentFullNameRest: residentName.rest,
    residentBirthDateShort: formatDateShort(resident.birthDate),
    residentPassportSeries: resident.passportSeries ?? '',
    residentPassportNumber: resident.passportNumber ?? '',
    residentPassportIssuedInfo: formatIssuedInfo(resident.passportIssuedBy, resident.passportIssuedCode, resident.passportIssuedAt),
    residentPassportIssuedByLine: resident.passportIssuedBy ?? '',
    residentPassportIssuedCodeDateLine: formatIssuedCodeDateLine(resident.passportIssuedCode, resident.passportIssuedAt),
    residentAddress: resident.address ?? '',
    residentAddressLine1: residentAddressSplit.line1,
    residentAddressLine2: residentAddressSplit.line2,
    residentSnils: resident.snils ?? '',
    residentPhone: formatRussianPhone(resident.phone),
    residentCourseLine,
    residentFacultetLine,
    residentInstituteCourseStacked: [residentCourseLine, residentFacultetLine].filter(Boolean).join(', '),
    residentFormObuch: resident.formObuch ?? '',

    legalRepFullName: contract.legalRepName ?? '',
    legalRepFullNameShort: surnameWithInitials(contract.legalRepName ?? ''),
    legalRepFullNameSurname: legalRepNameSplit.surname,
    legalRepFullNameRest: legalRepNameSplit.rest,
    legalRepPhone: formatRussianPhone(contract.legalRepPhone),
    legalRepBirthDateShort: formatDateShort(contract.legalRepBirthDate),
    legalRepPassportSeries: contract.legalRepPassportSeries ?? '',
    legalRepPassportNumber: contract.legalRepPassportNumber ?? '',
    legalRepPassportIssuedByLine: contract.legalRepPassportIssuedBy ?? '',
    legalRepPassportIssuedCodeDateLine: formatIssuedCodeDateLine(contract.legalRepPassportIssuedCode, contract.legalRepPassportIssuedAt),
    legalRepAddress: contract.legalRepAddress ?? '',
    legalRepAddressLine1: legalRepAddressSplit.line1,
    legalRepAddressLine2: legalRepAddressSplit.line2,
    legalRepSnils: contract.legalRepSnils ?? '',

    matCapitalCoveredFrom: formatDateShort(contract.matCapitalCoveredFrom),
    matCapitalCoveredTo: formatDateShort(contract.matCapitalCoveredTo),
    matCapitalAmount: formatMoney(contract.matCapitalAmount),
    matCapitalDeferredUntil: formatDateShort(contract.matCapitalDeferredUntil),
  };
}
