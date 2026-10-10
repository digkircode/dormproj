ALTER TABLE "contract_refunds" ALTER COLUMN "accrual_id" DROP NOT NULL;
ALTER TABLE "contract_refunds" ADD COLUMN "adjustment_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
UPDATE "contract_refunds" SET "adjustment_amount" = "amount" WHERE "accrual_id" IS NOT NULL;
