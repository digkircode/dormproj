import { Prisma } from '../../generated/prisma/client.js';

// Decimal -> number на выходе API — тот же приём, что уже в dormitory-info.controller.ts
// и characteristic-value.ts, деньги на фронт отдаём обычными числами (расчёты остаются
// только на backend, фронт их не пересчитывает).
export function serializeAccrual(accrual: {
  id: number;
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  rentAmount: Prisma.Decimal;
  utilitiesAmount: Prisma.Decimal;
  adjustmentAmount: Prisma.Decimal;
  adjustmentReason: string | null;
  voidedAt: Date | null;
  allocations?: { amount: Prisma.Decimal }[];
}) {
  const total = accrual.rentAmount.plus(accrual.utilitiesAmount).plus(accrual.adjustmentAmount);
  const paid = (accrual.allocations ?? []).reduce((sum, a) => sum.plus(a.amount), new Prisma.Decimal(0));
  return {
    id: accrual.id,
    periodStart: accrual.periodStart,
    periodEnd: accrual.periodEnd,
    dueDate: accrual.dueDate,
    rentAmount: Number(accrual.rentAmount),
    utilitiesAmount: Number(accrual.utilitiesAmount),
    adjustmentAmount: Number(accrual.adjustmentAmount),
    adjustmentReason: accrual.adjustmentReason,
    voidedAt: accrual.voidedAt,
    total: Number(total),
    paid: Number(paid),
    balance: Number(total.minus(paid)),
  };
}

export function serializePayment(payment: {
  id: number;
  amount: Prisma.Decimal;
  paidAt: Date;
  method: string;
  source: string;
  externalRef: string | null;
  rawComment: string | null;
  reversedAt: Date | null;
  createdAt: Date;
  accounting1cSyncStatus?: string;
  accounting1cDocumentUid?: string | null;
  accounting1cSyncError?: string | null;
  accounting1cSyncedAt?: Date | null;
  // "Откуда | Описание | Период" (billing/payment-purpose.ts) — считается на чтении там,
  // где загружены нужные связи (allocations/paymentIntent), не всегда доступно (например
  // сразу после создания/сторно платежа в billing.controller.ts — там их не догружают).
  purpose?: string;
}) {
  return {
    id: payment.id,
    amount: Number(payment.amount),
    paidAt: payment.paidAt,
    method: payment.method,
    source: payment.source,
    externalRef: payment.externalRef,
    rawComment: payment.rawComment,
    reversedAt: payment.reversedAt,
    createdAt: payment.createdAt,
    accounting1cSyncStatus: payment.accounting1cSyncStatus,
    accounting1cDocumentUid: payment.accounting1cDocumentUid,
    accounting1cSyncError: payment.accounting1cSyncError,
    accounting1cSyncedAt: payment.accounting1cSyncedAt,
    purpose: payment.purpose,
  };
}

export function serializeTerms(terms: {
  id: number;
  validFrom: Date;
  validTo: Date | null;
  rentAmount: Prisma.Decimal;
  utilitiesAmount: Prisma.Decimal;
  dailyRateCategory: string;
  dailyRateAmount: Prisma.Decimal;
  paymentDueDay: number;
}) {
  return {
    id: terms.id,
    validFrom: terms.validFrom,
    validTo: terms.validTo,
    rentAmount: Number(terms.rentAmount),
    utilitiesAmount: Number(terms.utilitiesAmount),
    dailyRateCategory: terms.dailyRateCategory,
    dailyRateAmount: Number(terms.dailyRateAmount),
    paymentDueDay: terms.paymentDueDay,
  };
}
