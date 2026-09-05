import { Prisma } from '../../generated/prisma/client.js';
import type { AccountingPaymentPush, AccountingSummDetail } from '../accounting-1c/accounting-1c.types';
import { buildPaymentPurpose } from './payment-purpose';

const { Decimal } = Prisma;

// "YYYY-MM-DDT00:00:00" — по образцу присланному 1С-разработчиком (ContractDate/Date в
// примере запроса были в ISO, без времени и без "Z" на конце), не "ДД.ММ.ГГГГ", как у
// АТОЛ/Эвотор (fiscal/atol-fiscal.provider.ts) — разные внешние API, не путать формат.
// Экспортирован — тот же формат подтверждён и у ServProvisionDoc (флоу 3, реальный пример
// 2026-09-04, см. service-provision-doc.service.ts), не только у флоу 1.
export function formatDateOnlyIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T00:00:00`;
}

type PaymentForPush = {
  id: number;
  contractId: number;
  amount: Prisma.Decimal;
  paidAt: Date;
  penaltyAmount: Prisma.Decimal;
  accounting1cDocumentUid: string | null;
  contract: {
    id: number;
    number: string;
    contractDate: Date;
    accounting1cUid: string | null;
    resident: { fullName: string; accounting1cContractorUid: string | null };
  };
  paymentIntent: { payerFullName: string } | null;
  allocations: {
    amount: Prisma.Decimal;
    isPartial: boolean;
    accrual: { rentAmount: Prisma.Decimal; utilitiesAmount: Prisma.Decimal; periodStart: Date };
  }[];
};

// Собирает DocumentSummDetails по тому же принципу, что уже описан у
// PaymentAllocation.isPartial в schema.prisma: полные (isPartial=false) разноски
// разбиваются на Найм/Коммуналка по факту начисления, частичные (isPartial=true) идут
// одной строкой "Найм" целиком, без деления — делить пропорционально не просили.
// Пеня — отдельно, из Payment.penaltyAmount (реальное разнесение, не начисление).
function buildSummDetails(payment: PaymentForPush): { details: AccountingSummDetail[]; naimTotal: Prisma.Decimal } {
  let naim = new Decimal(0);
  let utilities = new Decimal(0);

  for (const allocation of payment.allocations) {
    if (allocation.isPartial) {
      naim = naim.plus(allocation.amount);
      continue;
    }
    naim = naim.plus(allocation.accrual.rentAmount);
    utilities = utilities.plus(allocation.accrual.utilitiesAmount);
  }

  const details: AccountingSummDetail[] = [];
  if (naim.greaterThan(0)) details.push({ SummDetails: Number(naim), TypeDetails: 'Найм' });
  if (utilities.greaterThan(0)) details.push({ SummDetails: Number(utilities), TypeDetails: 'Коммуналка' });
  if (payment.penaltyAmount.greaterThan(0)) {
    details.push({ SummDetails: Number(payment.penaltyAmount), TypeDetails: 'Пени' });
  }
  return { details, naimTotal: naim };
}

export function buildAccountingPaymentPush(payment: PaymentForPush): AccountingPaymentPush {
  const { details, naimTotal } = buildSummDetails(payment);
  const osnovanie = buildPaymentPurpose({
    source: 'WEBSITE',
    residentFullName: payment.contract.resident.fullName,
    payerFullName: payment.paymentIntent?.payerFullName,
    periodStarts: payment.allocations.map((a) => a.accrual.periodStart),
    includePenalty: payment.penaltyAmount.greaterThan(0),
    fallbackPeriodDate: payment.paidAt,
  });

  return {
    DogovorID: payment.contract.id,
    OplataID: payment.id,
    ContractorUID: payment.contract.resident.accounting1cContractorUid ?? undefined,
    ContractUID: payment.contract.accounting1cUid ?? undefined,
    ContractorFIO: payment.contract.resident.fullName,
    ContractName: payment.contract.number,
    ContractDate: formatDateOnlyIso(payment.contract.contractDate),
    Date: formatDateOnlyIso(payment.paidAt),
    DocumentSumm: Number(payment.amount),
    DocumentSummNaim: Number(naimTotal),
    OplataContractor: payment.paymentIntent?.payerFullName ?? payment.contract.resident.fullName,
    Osnovanie: osnovanie,
    DocumentSummDetails: details,
    DocumentUID: payment.accounting1cDocumentUid ?? undefined,
  };
}
