-- Флоу 3 — "оказание услуг" (см. промпт проекта): ежемесячный крон собирает два документа
-- за закончившийся месяц (Найм/Коммуналка отдельно) по договорам ACTIVE/EXPIRING/OVERDUE
-- и отправляет в 1С Бухгалтерию (ServProvisionDoc). Одна строка таблицы = один документ
-- на месяц на тип, для идемпотентного повтора (accounting_1c_document_uid) и видимости
-- сотруднику (статус/ошибка/что реально отправили).

-- CreateEnum
CREATE TYPE "ServiceProvisionType" AS ENUM ('RENT', 'UTILITIES');

-- CreateTable
CREATE TABLE "service_provision_documents" (
    "id" SERIAL NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "type" "ServiceProvisionType" NOT NULL,
    "document_summ" DECIMAL(12,2) NOT NULL,
    "contract_count" INTEGER NOT NULL,
    "accounting_1c_sync_status" "Accounting1cSyncStatus" NOT NULL DEFAULT 'NOT_SYNCED',
    "accounting_1c_document_uid" TEXT,
    "accounting_1c_sync_error" TEXT,
    "accounting_1c_synced_at" TIMESTAMP(3),
    "raw_payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_provision_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_provision_documents_period_start_type_key" ON "service_provision_documents"("period_start", "type");
