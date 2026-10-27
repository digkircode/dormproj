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

export function buildPeriodLabel(accrualPeriodStarts: Date[], includePenalty: boolean): string {
  const uniqueLabels = [...new Set(accrualPeriodStarts.map(monthYearLabel))];
  let label = uniqueLabels.join(', ');
  if (includePenalty) {
    label = label ? `${label} и пеню` : 'пеню';
  }
  return label || 'общежитие';
}

export function buildPaymentDescription(
  residentFullName: string,
  payerIsResident: boolean,
  representativeFullName: string | null,
  periodLabel: string,
): string {
  const residentShort = surnameWithInitials(residentFullName);
  const subject = periodLabel === 'пеню' ? 'пени' : `за общежитие ${periodLabel}`;
  if (payerIsResident) {
    return `от ${residentShort} ${subject}`;
  }
  const payerShort = surnameWithInitials(representativeFullName ?? '');
  return `от ${payerShort} за ${residentShort} ${subject}`;
}
