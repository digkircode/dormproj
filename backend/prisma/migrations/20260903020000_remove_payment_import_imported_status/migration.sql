-- Статус IMPORTED ("Новый") по факту никогда не проставляется ни одним путём создания
-- PaymentImportRecord — единственное место, где такие записи создаются
-- (payment-imports-ingest.service.ts#ingest), всегда сразу ищет предложение договора и
-- жёстко присваивает NEEDS_REVIEW, независимо от того, нашлось предложение или нет.
-- IMPORTED существовал только как default колонки, который эта же логика тут же
-- перезаписывает — по факту недостижимое значение enum, из-за которого чип фильтра по
-- умолчанию на /payment-imports путал сотрудников (см. промпт проекта). Убираем целиком.
-- На момент миграции строк с этим статусом 0 (не может быть в принципе, см. выше).
-- Postgres не даёт удалить значение enum напрямую — пересоздаём тип, тот же приём, что и
-- в 20260903010000_remove_payment_import_rejected_status (удаление REJECTED).
ALTER TYPE "PaymentImportStatus" RENAME TO "PaymentImportStatus_old";

CREATE TYPE "PaymentImportStatus" AS ENUM ('MATCHED', 'NEEDS_REVIEW');

ALTER TABLE "payment_import_records" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "payment_import_records" ALTER COLUMN "status" TYPE "PaymentImportStatus" USING ("status"::text::"PaymentImportStatus");
ALTER TABLE "payment_import_records" ALTER COLUMN "status" SET DEFAULT 'NEEDS_REVIEW';

DROP TYPE "PaymentImportStatus_old";
