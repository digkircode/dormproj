-- Пеня теперь всегда оплачивается отдельным платежом (см. my-payments.controller.ts) —
-- флаг говорит reconcileBankStatus не разносить сумму по начислениям (allocatePaymentFifo),
-- чтобы она гарантированно засчиталась в пеню, а не в старейшее непогашенное начисление.
ALTER TABLE "payment_intents" ADD COLUMN "penalty_only" BOOLEAN NOT NULL DEFAULT false;
