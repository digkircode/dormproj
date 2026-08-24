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

// "кем и когда выдан" одной строкой — только для полей без запасной строки-ячейки в
// бланке (см. residentPassportIssuedInfo у "Проживающего" в бланке несовершеннолетнего,
// там и так широкая ячейка). Там, где есть запасная строка (см. buildDocumentData),
// печатаем раздельно: кем выдан — своей строкой, код+дата — своей, каждая с рамкой.
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

// "Институт, курс" в бланке — курс сразу рядом с меткой, институт отдельной строкой
// ниже (см. эталонный заполненный договор) — либо в двух разных ячейках (std), либо
// в одной ячейке с переносом (minor, см. buildDocumentData).
function formatCourseLine(kursNumber: number | null): string {
  return kursNumber ? `${kursNumber} курс` : '';
}

// Фамилия отдельно от имени/отчества — первая строка ячейки "Ф.И.О. (полностью)"
// содержит только фамилию, имя и отчество печатаются строкой ниже (см. эталон).
function splitSurnameRest(fullName: string): { surname: string; rest: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { surname: '', rest: '' };
  return { surname: parts[0], rest: parts.slice(1).join(' ') };
}

// Адрес — в две зарезервированные строки-ячейки со своими рамками (как ФИО), а не
// перенос Word'ом внутри одной ячейки — иначе у первой визуальной строки нет своей
// границы (та же причина, что была у "кем и когда выдан"). Разбивка по границе слова
// ближе к ширине широкой ячейки (~8.7-9 см, ~40 символов при 11pt Times New Roman) —
// имитирует естественный перенос, не разбивает через запятую как раньше (то давало
// слишком много коротких строк).
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

// {rentAmount}/{rentAmountWords}/{rentAmountCurrency}/{rentAmountKopecks} и аналоги —
// цифрами, прописью (без "рублей" — то печатается отдельным тегом currency СНАРУЖИ скобок
// в бланке, см. rublesInWords) и копейками отдельными тегами (см. п.4.1/5.1 бланка).
function moneyBreakdown(value: Prisma.Decimal): { digits: string; words: string; currency: string; kopecksText: string } {
  const { rubles, kopecksText } = splitRublesAndKopecks(value);
  return { digits: formatRublesDigits(rubles), words: rublesInWords(rubles), currency: rublesCurrencyWord(rubles), kopecksText };
}

// "Фамилия И.О." — для строки подписи в самом низу бланка (подписано "Фамилия,
// инициалы", не полное ФИО, в отличие от строки "Ф.И.О. (полностью)" выше по документу).
function surnameWithInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const [surname, ...rest] = parts;
  const initials = rest.map((p) => `${p.charAt(0).toUpperCase()}.`).join('');
  return initials ? `${surname} ${initials}` : surname;
}

// Номер хранится в международном формате intl-tel-input ("+7 999 123-45-67", см.
// PhoneInput.vue) — для печати приводим к привычному российскому виду с круглыми
// скобками на код города/оператора. Нероссийский/нераспознанный номер выводится как есть.
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
}

interface TermsLike {
  rentAmount: Prisma.Decimal;
  utilitiesAmount: Prisma.Decimal;
  dailyRateAmount: Prisma.Decimal;
  dailyRateCategory: string;
}

// Плоский набор {tag} -> значение для docxtemplater — единый и для обычного бланка (там
// "Наниматель" = сам проживающий, легалреп — только информационная строка ФИО+телефон),
// и для бланка несовершеннолетних (там "Наниматель" = родитель, "Проживающий" = резидент).
// Незаполненные строковые теги отдаются пустой строкой — docxtemplater иначе падает на
// unresolved tag; isOwnUniversity — единственный булев тег, инлайн-секция
// {#isOwnUniversity}...{/isOwnUniversity} внутри абзаца п.1.2 показывает или прячет
// строку "Категория/форма обучения" (см. contract-document.ts) — не отдельным абзацем
// (paragraphLoop не убирает пустой абзац целиком, только опустошает его текст).
export function buildDocumentData(
  contract: ContractLike,
  resident: ResidentSnapshot,
  terms: TermsLike | undefined,
  room: { room: string } | null,
  communalServicesCost: Prisma.Decimal | null,
): Record<string, string | boolean> {
  // Без данных — оставляем п.5.5 как в исходном макете (подчёркивания под заполнение от
  // руки), а не тире: тире тут смотрелось чужеродно рядом с уже нетронутыми "________"
  // в следующем абзаце того же пункта ("с возможностью отсрочки..." — отдельный статичный
  // абзац бланка, {matCapitalText} его не касается, см. contract-minor.docx).
  const matCapitalText =
    contract.matCapitalCoveredFrom && contract.matCapitalCoveredTo && contract.matCapitalAmount !== null
      ? `за период с ${formatDateShort(contract.matCapitalCoveredFrom)} по ${formatDateShort(contract.matCapitalCoveredTo)} в сумме ${formatMoney(contract.matCapitalAmount)}`
      : 'за период с ______________ по ______________ в сумме _______________________';

  const isOwnUniversity = terms?.dailyRateCategory === 'OWN_UNIVERSITY';
  const residenceReasonText = isOwnUniversity
    ? 'обучением в АНО ВО «РосНОУ»'
    : contract.residenceReason
      ? `«${contract.residenceReason}»`
      : '';

  // ContractTerms.utilitiesAmount в БД всегда 0 (коммуналка уже включена в rentAmount —
  // см. Contracts.vue/ContractDetail.vue, "стоимость комнаты" из характеристики уже
  // покрывает всё), поэтому печатать его напрямую в п.4.1/5.1 нельзя — бланк дословно
  // говорит "плата за коммунальные услуги составляет 0 руб.", что неверно (коммуналка не
  // бесплатна, она просто не выделена отдельной строкой в начислении). Для печати делим
  // ЕДИНУЮ rentAmount на "наём"/"коммуналка" тем же способом, что уже показывает
  // ContractDetail.vue как справочную величину (DormitoryInfo.communalServicesCost) — сумма
  // двух строк остаётся равна rentAmount (totalMonthly не меняется, просто перестаёт
  // выглядеть как двойной счёт), с бухгалтерией/начислениями это никак не связано (там как
  // была одна rentAmount, так и осталась).
  const rawUtilities = communalServicesCost ?? new Prisma.Decimal(0);
  const utilitiesForDoc = terms && rawUtilities.lessThan(terms.rentAmount) ? rawUtilities : (terms?.rentAmount ?? new Prisma.Decimal(0));
  const rentForDoc = terms ? terms.rentAmount.minus(utilitiesForDoc) : new Prisma.Decimal(0);

  const emptyBreakdown = { digits: '', words: '', currency: '', kopecksText: '' };
  const rent = terms ? moneyBreakdown(rentForDoc) : emptyBreakdown;
  const utilities = terms ? moneyBreakdown(utilitiesForDoc) : emptyBreakdown;
  const total = terms ? moneyBreakdown(terms.rentAmount) : emptyBreakdown;

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
    // Комбинированная строка — только для "Проживающего" в бланке несовершеннолетнего
    // (там одна широкая ячейка без запасной строки над ней, см. transform-templates).
    residentPassportIssuedInfo: formatIssuedInfo(resident.passportIssuedBy, resident.passportIssuedCode, resident.passportIssuedAt),
    // Раздельно на 2 строки — для обычного бланка и "Наниматель" в бланке
    // несовершеннолетнего, там есть запасная строка-ячейка над полем (см. эталон: кем
    // выдан — своей строкой, код+дата — своей).
    residentPassportIssuedByLine: resident.passportIssuedBy ?? '',
    residentPassportIssuedCodeDateLine: formatIssuedCodeDateLine(resident.passportIssuedCode, resident.passportIssuedAt),
    residentAddress: resident.address ?? '',
    residentAddressLine1: residentAddressSplit.line1,
    residentAddressLine2: residentAddressSplit.line2,
    residentSnils: resident.snils ?? '',
    residentPhone: formatRussianPhone(resident.phone),
    residentCourseLine,
    residentFacultetLine,
    // Бланк несовершеннолетнего печатает курс+институт в одной широкой ячейке (нет
    // отдельной строки-заготовки под институт, как в обычном бланке) — одной строкой
    // (было переносом на 2 строки, поправлено по просьбе 2026-08-23).
    residentInstituteCourseStacked: [residentCourseLine, residentFacultetLine].filter(Boolean).join(', '),
    residentFormObuch: resident.formObuch ?? '',

    legalRepFullName: contract.legalRepName ?? '',
    legalRepFullNameShort: surnameWithInitials(contract.legalRepName ?? ''),
    legalRepFullNameSurname: legalRepNameSplit.surname,
    legalRepFullNameRest: legalRepNameSplit.rest,
    legalRepPhone: formatRussianPhone(contract.legalRepPhone),
    legalRepNameAndPhone: [contract.legalRepName, formatRussianPhone(contract.legalRepPhone) || null].filter(Boolean).join(', '),
    legalRepBirthDateShort: formatDateShort(contract.legalRepBirthDate),
    legalRepPassportSeries: contract.legalRepPassportSeries ?? '',
    legalRepPassportNumber: contract.legalRepPassportNumber ?? '',
    legalRepPassportIssuedByLine: contract.legalRepPassportIssuedBy ?? '',
    legalRepPassportIssuedCodeDateLine: formatIssuedCodeDateLine(contract.legalRepPassportIssuedCode, contract.legalRepPassportIssuedAt),
    legalRepAddress: contract.legalRepAddress ?? '',
    legalRepAddressLine1: legalRepAddressSplit.line1,
    legalRepAddressLine2: legalRepAddressSplit.line2,
    legalRepSnils: contract.legalRepSnils ?? '',

    matCapitalText,
  };
}
