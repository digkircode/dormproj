-- Интеграция с 1С Бухгалтерией (см. промпт проекта, раздел про эквайринг/импорт платежей):
-- (1) ContractorUID/ContractUID запоминаются на Individual/Contract после первой успешной
-- отправки платежа, чтобы 1С не создавала дубли контрагента/договора на каждую отправку;
-- (2) статус отправки WEBSITE-платежей в 1С — на самом Payment;
-- (3) suggested_contract_id на PaymentImportRecord — предложение системы при разборе
-- платежей ИЗ 1С, отдельно от matched_contract_id (то — подтверждённое решение сотрудника).

-- CreateEnum
CREATE TYPE "Accounting1cSyncStatus" AS ENUM ('NOT_SYNCED', 'SYNCED', 'FAILED');

-- AlterTable
ALTER TABLE "individuals" ADD COLUMN "accounting_1c_contractor_uid" TEXT;

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN "accounting_1c_uid" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN "accounting_1c_sync_status" "Accounting1cSyncStatus" NOT NULL DEFAULT 'NOT_SYNCED',
ADD COLUMN "accounting_1c_document_uid" TEXT,
ADD COLUMN "accounting_1c_sync_error" TEXT,
ADD COLUMN "accounting_1c_synced_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "payment_import_records" ADD COLUMN "suggested_contract_id" INTEGER;

-- AddForeignKey
ALTER TABLE "payment_import_records" ADD CONSTRAINT "payment_import_records_suggested_contract_id_fkey" FOREIGN KEY ("suggested_contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
