-- Функция "Отклонить" на странице разбора платежей из 1С убрана целиком (по прямой
-- просьбе 2026-09-03 — при неверных данных сотрудник правит их в 1С, на сайте
-- перезапишется при следующем импорте). REJECTED больше никогда не проставляется —
-- на момент миграции строк с этим статусом 0 (проверено), безопасно убрать из enum.
-- Postgres не даёт удалить значение enum напрямую — пересоздаём тип, тот же приём,
-- что и в 20260831020000_contract_status_lifecycle (удаление EXPIRED).
ALTER TYPE "PaymentImportStatus" RENAME TO "PaymentImportStatus_old";

CREATE TYPE "PaymentImportStatus" AS ENUM ('IMPORTED', 'MATCHED', 'NEEDS_REVIEW');

ALTER TABLE "payment_import_records" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "payment_import_records" ALTER COLUMN "status" TYPE "PaymentImportStatus" USING ("status"::text::"PaymentImportStatus");
ALTER TABLE "payment_import_records" ALTER COLUMN "status" SET DEFAULT 'IMPORTED';

DROP TYPE "PaymentImportStatus_old";
