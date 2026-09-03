import { surnameWithInitials } from '../contracts/contract-document-data';
import { buildPeriodLabel } from '../my-payments/payment-description';

// Единый формат "Откуда | Описание | Период" — по прямой просьбе 2026-09-03, используется
// и как Osnovanie для 1С Бухгалтерии (build-accounting-payment-payload.ts), и для отображения
// в таблице платежей на самом сайте (не только для выгрузки) — единообразно, один источник
// правды на оба места.

export type PaymentPurposeSource = 'MANUAL' | 'IMPORTED_1C' | 'WEBSITE';

// "1С: Бухгалтерия" — платёж пришёл ИЗ 1С (флоу 2, касса/перевод/по реквизитам, ещё не
// реализовано); "HostelRosNOUWeb (Эквайринг)" — оплата картой резидентом на сайте
// (source=WEBSITE, сейчас всегда через эквайринг); "HostelRosNOUWeb" — платёж внесён
// сотрудником вручную через сайт (source=MANUAL, метод — любой: наличные/перевод/мат.капитал).
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

// "от Иванов И.И." — если плательщик и резидент один и тот же человек; "от Иванов И.И. за
// Цуйков А.В." — если платит представитель/другой человек за резидента.
function paymentPayerDescription(residentFullName: string, payerFullName: string): string {
  const residentShort = surnameWithInitials(residentFullName);
  if (payerFullName === residentFullName) return `от ${residentShort}`;
  return `от ${surnameWithInitials(payerFullName)} за ${residentShort}`;
}

export interface PaymentPurposeInput {
  source: PaymentPurposeSource;
  residentFullName: string;
  // Фактический плательщик — для WEBSITE это PaymentIntent.payerFullName, для
  // MANUAL/IMPORTED_1C отдельного поля пока нет (см. промпт проекта — флоу 2 не
  // реализован), по умолчанию считаем, что платит сам резидент.
  payerFullName?: string;
  periodStarts: Date[];
  includePenalty: boolean;
}

export function buildPaymentPurpose(input: PaymentPurposeInput): string {
  const from = sourceLabel(input.source);
  const description = paymentPayerDescription(input.residentFullName, input.payerFullName ?? input.residentFullName);
  const period = buildPeriodLabel(input.periodStarts, input.includePenalty);
  return [from, description, period].filter(Boolean).join(' | ');
}
