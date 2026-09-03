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

// "от Иванов И.И. оплата общежития" — если плательщик и резидент один и тот же человек;
// "от Иванов И.И. за Цуйков А.В. оплата общежития" — если платит представитель/другой
// человек за резидента. "пени" вместо "оплата общежития" — если период (см. вызов ниже)
// оказался ровно "пеню" (платёж только пени, без единого начисления, см. buildPeriodLabel).
function paymentPayerDescription(residentFullName: string, payerFullName: string, isPenaltyOnly: boolean): string {
  const residentShort = surnameWithInitials(residentFullName);
  const subject = isPenaltyOnly ? 'пени' : 'оплата общежития';
  if (payerFullName === residentFullName) return `от ${residentShort} ${subject}`;
  return `от ${surnameWithInitials(payerFullName)} за ${residentShort} ${subject}`;
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
  // Дата самого платежа — фолбэк на период, когда у платежа нет ни одной реальной
  // разноски (allocations пуст: ручной демо-платёж, аванс без начисления и т.п.) —
  // без этого period получался бы пустым и в "Назначении" после второго "|" не было
  // бы вообще ничего, только буквально "общежитие" (дефолт buildPeriodLabel не под
  // эту схему), что выглядит как пропущенный период, а не как отсутствие данных.
  fallbackPeriodDate?: Date;
}

export function buildPaymentPurpose(input: PaymentPurposeInput): string {
  const from = sourceLabel(input.source);
  const periodStarts = input.periodStarts.length > 0 || !input.fallbackPeriodDate ? input.periodStarts : [input.fallbackPeriodDate];
  const period = buildPeriodLabel(periodStarts, input.includePenalty);
  const description = paymentPayerDescription(input.residentFullName, input.payerFullName ?? input.residentFullName, period === 'пеню');
  return [from, description, period].filter(Boolean).join(' | ');
}
