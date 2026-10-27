ALTER TABLE "contracts" ADD COLUMN "penalty_recalc_pending" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "contracts" ADD COLUMN "penalty_recalc_revision" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "contracts_penalty_recalc_pending_id_idx" ON "contracts"("penalty_recalc_pending", "id");

UPDATE "contracts" AS c
SET "penalty_recalc_pending" = true, "penalty_recalc_revision" = 1
WHERE EXISTS (SELECT 1 FROM "payments" AS p WHERE p."contract_id" = c."id");
