-- Платежи, их разнесение по начислениям и стадия импорта из 1С — см. Payment/
-- PaymentAllocation/PaymentImportRecord в schema.prisma.

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD_ACQUIRING', 'BANK_TRANSFER', 'MAT_CAPITAL', 'WEBSITE');

-- CreateEnum
CREATE TYPE "PaymentSource" AS ENUM ('MANUAL', 'IMPORTED_1C', 'WEBSITE');

-- CreateEnum
CREATE TYPE "PaymentImportStatus" AS ENUM ('IMPORTED', 'MATCHED', 'NEEDS_REVIEW', 'REJECTED');

-- CreateTable
CREATE TABLE "payments" (
    "id" SERIAL NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "source" "PaymentSource" NOT NULL,
    "external_ref" TEXT,
    "raw_comment" TEXT,
    "reversed_at" TIMESTAMP(3),
    "created_by_user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payments_source_external_ref_key" ON "payments"("source", "external_ref");
CREATE INDEX "payments_contract_id_paid_at_idx" ON "payments"("contract_id", "paid_at");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" SERIAL NOT NULL,
    "payment_id" INTEGER NOT NULL,
    "accrual_id" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_allocations_payment_id_idx" ON "payment_allocations"("payment_id");
CREATE INDEX "payment_allocations_accrual_id_idx" ON "payment_allocations"("accrual_id");

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_accrual_id_fkey" FOREIGN KEY ("accrual_id") REFERENCES "accruals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "payment_import_records" (
    "id" SERIAL NOT NULL,
    "source" TEXT NOT NULL DEFAULT '1C',
    "external_id" TEXT NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PaymentImportStatus" NOT NULL DEFAULT 'IMPORTED',
    "matched_contract_id" INTEGER,
    "resulting_payment_id" INTEGER,
    "reviewed_by_user_id" INTEGER,
    "reviewed_at" TIMESTAMP(3),

    CONSTRAINT "payment_import_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_import_records_resulting_payment_id_key" ON "payment_import_records"("resulting_payment_id");
CREATE UNIQUE INDEX "payment_import_records_source_external_id_key" ON "payment_import_records"("source", "external_id");
CREATE INDEX "payment_import_records_status_idx" ON "payment_import_records"("status");

-- AddForeignKey
ALTER TABLE "payment_import_records" ADD CONSTRAINT "payment_import_records_matched_contract_id_fkey" FOREIGN KEY ("matched_contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_import_records" ADD CONSTRAINT "payment_import_records_resulting_payment_id_fkey" FOREIGN KEY ("resulting_payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
