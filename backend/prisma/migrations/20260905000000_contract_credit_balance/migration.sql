-- Переплата сверх всех начислений (включая будущие) и пени раньше молча терялась — деньги
-- были в Payment.amount, но не отражались ни в одной PaymentAllocation (код-ревью
-- 2026-09-04, см. промпт проекта). Теперь копится здесь и переиспользуется в
-- allocatePaymentFifo (billing/payment-allocation.ts) на следующем платеже по договору.
ALTER TABLE "contracts" ADD COLUMN "credit_balance" DECIMAL(12,2) NOT NULL DEFAULT 0;
