import { surnameWithInitials } from '../contracts/contract-document-data';

const MONTHS_NOMINATIVE = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

function monthYearLabel(date: Date): string {
  return `${MONTHS_NOMINATIVE[date.getMonth()]} ${date.getFullYear()}`;
}

// "август 2026" / "август 2026, сентябрь 2026" / "август 2026 и пеню" / просто "пеню" —
// период под конкретные выбранные начисления, для описания платежа (см. buildPaymentDescription
// ниже) и как ориентир для наименования позиции в чеке кассы.
export function buildPeriodLabel(accrualPeriodStarts: Date[], includePenalty: boolean): string {
  const uniqueLabels = [...new Set(accrualPeriodStarts.map(monthYearLabel))];
  let label = uniqueLabels.join(', ');
  if (includePenalty) {
    label = label ? `${label} и пеню` : 'пеню';
  }
  return label || 'общежитие';
}

// Формат — по прямой просьбе (2026-08-25):
// проживающий сам: "от Фамилия И.О. за общежитие месяц год"
// представитель:    "от Фамилия И.О. за Фамилия И.О. за общежитие месяц год"
export function buildPaymentDescription(
  residentFullName: string,
  payerIsResident: boolean,
  representativeFullName: string | null,
  periodLabel: string,
): string {
  const residentShort = surnameWithInitials(residentFullName);
  if (payerIsResident) {
    return `от ${residentShort} за общежитие ${periodLabel}`;
  }
  const payerShort = surnameWithInitials(representativeFullName ?? '');
  return `от ${payerShort} за ${residentShort} за общежитие ${periodLabel}`;
}
