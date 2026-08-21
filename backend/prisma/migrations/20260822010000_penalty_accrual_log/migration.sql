-- Пеня больше не хранится одним числом на Contract — вместо этого журнал по дням
-- (PenaltyAccrualLog): и аудит "откуда взялась сумма" (по прямой просьбе 2026-08-22), и
-- единственный способ восстановить пеню на произвольную ПРОШЛУЮ дату для финансового
-- отчёта "на дату" (суммой строк журнала по этот день, а не текущим значением поля).
-- РИСКОВАННАЯ миграция — удаляет накопленное contracts.penalty_amount без переноса в
-- журнал (перенести нечем: не было истории по дням под старым полем).

ALTER TABLE "contracts" DROP COLUMN "penalty_amount";

-- CreateTable
CREATE TABLE "penalty_accrual_log" (
    "id" SERIAL NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "overdue_base" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "penalty_accrual_log_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "penalty_accrual_log_contract_id_date_key" ON "penalty_accrual_log"("contract_id", "date");
CREATE INDEX "penalty_accrual_log_contract_id_date_idx" ON "penalty_accrual_log"("contract_id", "date");

-- AddForeignKey
ALTER TABLE "penalty_accrual_log" ADD CONSTRAINT "penalty_accrual_log_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
