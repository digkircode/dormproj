import { surnameWithInitials } from '../contracts/contract-document-data';
import { buildPeriodLabel } from '../my-payments/payment-description';


export type PaymentPurposeSource = 'MANUAL' | 'IMPORTED_1C' | 'WEBSITE';

function sourceLabel(source: PaymentPurposeSource): string {
  switch (source) {
    case 'IMPORTED_1C':
      return '1С: Бухгалтерия';
    case 'WEBSITE':
      return 'HostelRosNOUWeb (Эквайринг)';
    case 'MANUAL':
      return 'HostelRosNOUWeb';
  }
}

function paymentPayerDescription(residentFullName: string, payerFullName: string, isPenaltyOnly: boolean): string {
  const residentShort = surnameWithInitials(residentFullName);
  const subject = isPenaltyOnly ? 'пени' : 'оплата общежития';
  if (payerFullName === residentFullName) return `от ${residentShort} ${subject}`;
  return `от ${surnameWithInitials(payerFullName)} за ${residentShort} ${subject}`;
}

export interface PaymentPurposeInput {
  source: PaymentPurposeSource;
  residentFullName: string;
  payerFullName?: string;
  periodStarts: Date[];
  includePenalty: boolean;
  fallbackPeriodDate?: Date;
}

export function buildPaymentPurpose(input: PaymentPurposeInput): string {
  const from = sourceLabel(input.source);
  const periodStarts = input.periodStarts.length > 0 || !input.fallbackPeriodDate ? input.periodStarts : [input.fallbackPeriodDate];
  const period = buildPeriodLabel(periodStarts, input.includePenalty);
  const description = paymentPayerDescription(input.residentFullName, input.payerFullName ?? input.residentFullName, period === 'пеню');
  return [from, description, period].filter(Boolean).join(' | ');
}
