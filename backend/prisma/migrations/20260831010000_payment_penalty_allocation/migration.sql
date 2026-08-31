-- Реальное разнесение платежа на пеню (вместо эвристики "leftover" на чтении, см.
-- billing/penalty-balance.ts) и признак частичной разноски по начислению — оба нужны
-- для будущей выгрузки платежей в 1С (DocumentSummDetails: "Найм"/"Коммуналка"/"Пени"
-- отдельными строками, см. billing/payment-allocation.ts).
ALTER TABLE "payments" ADD COLUMN "penalty_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payment_allocations" ADD COLUMN "is_partial" BOOLEAN NOT NULL DEFAULT false;
