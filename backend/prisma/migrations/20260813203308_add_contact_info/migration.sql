-- period_text/date_start_text у passports и так никогда не NULL, просто явно
-- фиксируем это в БД вслед за schema.prisma.
ALTER TABLE "passports" ALTER COLUMN "period_text" SET NOT NULL,
ALTER COLUMN "date_start_text" SET NOT NULL;

-- CreateTable
CREATE TABLE "contact_infos" (
    "id" SERIAL NOT NULL,
    "fizicheskoye_litso_uid" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "predstavleniye" TEXT NOT NULL,
    "xml" TEXT NOT NULL,
    "json" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "phone_number_no_code" TEXT NOT NULL,
    "date_start" TIMESTAMP(3) NOT NULL,
    "date_start_text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_infos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_infos_fizicheskoye_litso_uid_idx" ON "contact_infos"("fizicheskoye_litso_uid");

-- AddForeignKey
ALTER TABLE "contact_infos" ADD CONSTRAINT "contact_infos_fizicheskoye_litso_uid_fkey" FOREIGN KEY ("fizicheskoye_litso_uid") REFERENCES "individuals"("fizicheskoye_litso_uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- date_start_text выше создан как обычный NOT NULL TEXT (Postgres не даёт объявить STORED
-- generated column вместе с обычными колонками через Prisma-диалект) — пересоздаём как
-- generated. Таблица только что создана и пуста, drop+add ничего не теряет. to_char() не
-- годится (не IMMUTABLE) — см. individual_birth_date_text.
ALTER TABLE "contact_infos" DROP COLUMN "date_start_text";
ALTER TABLE "contact_infos" ADD COLUMN "date_start_text" TEXT GENERATED ALWAYS AS (
  lpad(EXTRACT(DAY FROM "date_start")::text, 2, '0') || '.' ||
  lpad(EXTRACT(MONTH FROM "date_start")::text, 2, '0') || '.' ||
  EXTRACT(YEAR FROM "date_start")::text
) STORED;

-- Та же коллация, что и у остальных Cyrillic-текстовых полей (см. предыдущие *_ru_collation).
-- xml/json намеренно не трогаем — по ним не сортируем и не считаем важным строгий
-- алфавитный порядок для сырых блобов.
ALTER TABLE "contact_infos" ALTER COLUMN "type" TYPE TEXT COLLATE "ru-RU-x-icu";
ALTER TABLE "contact_infos" ALTER COLUMN "predstavleniye" TYPE TEXT COLLATE "ru-RU-x-icu";
ALTER TABLE "contact_infos" ALTER COLUMN "country" TYPE TEXT COLLATE "ru-RU-x-icu";
ALTER TABLE "contact_infos" ALTER COLUMN "region" TYPE TEXT COLLATE "ru-RU-x-icu";
ALTER TABLE "contact_infos" ALTER COLUMN "city" TYPE TEXT COLLATE "ru-RU-x-icu";
