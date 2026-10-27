import { Prisma } from '../../generated/prisma/client.js';
import type { AccountingPaymentPush, AccountingSummDetail } from '../accounting-1c/accounting-1c.types';
import { buildPaymentPurpose } from './payment-purpose';

const { Decimal } = Prisma;

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

function buildSummDetails(payment: PaymentForPush): { details: AccountingSummDetail[]; naimTotal: Prisma.Decimal; grandTotal: Prisma.Decimal } {
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
  return { details, naimTotal: naim, grandTotal: naim.plus(utilities).plus(payment.penaltyAmount) };
}

export function buildAccountingPaymentPush(payment: PaymentForPush): AccountingPaymentPush {
  const { details, naimTotal, grandTotal } = buildSummDetails(payment);
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
    DocumentSumm: Number(grandTotal),
    DocumentSummNaim: Number(naimTotal),
    OplataContractor: payment.paymentIntent?.payerFullName ?? payment.contract.resident.fullName,
    Osnovanie: osnovanie,
    DocumentSummDetails: details,
    DocumentUID: payment.accounting1cDocumentUid ?? undefined,
  };
}
