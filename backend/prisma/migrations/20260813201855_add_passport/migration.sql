-- period_text у citizenships и так никогда не NULL (period обязателен), просто явно
-- фиксируем это в БД вслед за schema.prisma.
ALTER TABLE "citizenships" ALTER COLUMN "period_text" SET NOT NULL;

-- CreateTable
CREATE TABLE "passports" (
    "id" SERIAL NOT NULL,
    "fizicheskoye_litso_uid" TEXT NOT NULL,
    "period" TIMESTAMP(3) NOT NULL,
    "period_text" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "date_start" TIMESTAMP(3) NOT NULL,
    "date_start_text" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "code_unit" TEXT NOT NULL,
    "system_doc" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "passports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "passports_fizicheskoye_litso_uid_idx" ON "passports"("fizicheskoye_litso_uid");

-- AddForeignKey
ALTER TABLE "passports" ADD CONSTRAINT "passports_fizicheskoye_litso_uid_fkey" FOREIGN KEY ("fizicheskoye_litso_uid") REFERENCES "individuals"("fizicheskoye_litso_uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- period_text/date_start_text выше созданы как обычные NOT NULL TEXT (Postgres не даёт
-- объявить STORED generated column вместе с обычными колонками через Prisma-диалект) —
-- пересоздаём как generated. Таблица только что создана и пуста, drop+add ничего не теряет.
-- to_char() не годится (не IMMUTABLE) — см. individual_birth_date_text.
ALTER TABLE "passports" DROP COLUMN "period_text";
ALTER TABLE "passports" ADD COLUMN "period_text" TEXT GENERATED ALWAYS AS (
  lpad(EXTRACT(DAY FROM "period")::text, 2, '0') || '.' ||
  lpad(EXTRACT(MONTH FROM "period")::text, 2, '0') || '.' ||
  EXTRACT(YEAR FROM "period")::text
) STORED;

ALTER TABLE "passports" DROP COLUMN "date_start_text";
ALTER TABLE "passports" ADD COLUMN "date_start_text" TEXT GENERATED ALWAYS AS (
  lpad(EXTRACT(DAY FROM "date_start")::text, 2, '0') || '.' ||
  lpad(EXTRACT(MONTH FROM "date_start")::text, 2, '0') || '.' ||
  EXTRACT(YEAR FROM "date_start")::text
) STORED;

-- Та же коллация, что и у остальных Cyrillic-текстовых полей (см. предыдущие *_ru_collation).
ALTER TABLE "passports" ALTER COLUMN "type" TYPE TEXT COLLATE "ru-RU-x-icu";
ALTER TABLE "passports" ALTER COLUMN "unit" TYPE TEXT COLLATE "ru-RU-x-icu";
