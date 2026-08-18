-- Начисления — одна строка на расчётный период (обычно календарный месяц), см. Accrual
-- в schema.prisma. Долг не хранится отдельным полем — считается на чтении.

-- CreateTable
CREATE TABLE "accruals" (
    "id" SERIAL NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "rent_amount" DECIMAL(12,2) NOT NULL,
    "utilities_amount" DECIMAL(12,2) NOT NULL,
    "penalty_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "penalty_accrued_through" TIMESTAMP(3),
    "adjustment_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "adjustment_reason" TEXT,
    "voided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accruals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "accruals_contract_id_period_start_period_end_key" ON "accruals"("contract_id", "period_start", "period_end");
CREATE INDEX "accruals_due_date_idx" ON "accruals"("due_date");

-- AddForeignKey
ALTER TABLE "accruals" ADD CONSTRAINT "accruals_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
