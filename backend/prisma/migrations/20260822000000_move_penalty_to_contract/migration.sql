-- Пеня становится единой суммой на весь договор, а не на отдельное начисление (по прямой
-- просьбе 2026-08-22: база пени — сумма всех ПРОСРОЧЕННЫХ и непогашенных начислений
-- договора целиком, не одно начисление, см. Contract/Accrual в schema.prisma и
-- billing/penalty.scheduler.ts). РИСКОВАННАЯ миграция — удаляет накопленные значения
-- penalty_amount по отдельным начислениям (если на проде уже что-то накопилось под старой
-- формулой, оно не переносится: старая и новая формула несовместимы напрямую).

ALTER TABLE "accruals" DROP COLUMN "penalty_amount";
ALTER TABLE "accruals" DROP COLUMN "penalty_accrued_through";

ALTER TABLE "contracts" ADD COLUMN "penalty_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "contracts" ADD COLUMN "penalty_accrued_through" TIMESTAMP(3);
