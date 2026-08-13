-- CreateTable
CREATE TABLE "citizenships" (
    "id" SERIAL NOT NULL,
    "fizicheskoye_litso_uid" TEXT NOT NULL,
    "period" TIMESTAMP(3) NOT NULL,
    "period_text" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "citizenships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "citizenships_fizicheskoye_litso_uid_idx" ON "citizenships"("fizicheskoye_litso_uid");

-- AddForeignKey
ALTER TABLE "citizenships" ADD CONSTRAINT "citizenships_fizicheskoye_litso_uid_fkey" FOREIGN KEY ("fizicheskoye_litso_uid") REFERENCES "individuals"("fizicheskoye_litso_uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Postgres не даёт объявить STORED generated column прямо в CREATE TABLE вместе с обычными
-- колонками через Prisma-диалект, поэтому period_text выше создан как обычный NOT NULL TEXT,
-- а тут пересоздаётся как generated. Таблица только что создана и пуста, так что drop+add
-- ничего не теряет. to_char() не годится (не IMMUTABLE) — см. individual_birth_date_text.
ALTER TABLE "citizenships" DROP COLUMN "period_text";
ALTER TABLE "citizenships" ADD COLUMN "period_text" TEXT GENERATED ALWAYS AS (
  lpad(EXTRACT(DAY FROM "period")::text, 2, '0') || '.' ||
  lpad(EXTRACT(MONTH FROM "period")::text, 2, '0') || '.' ||
  EXTRACT(YEAR FROM "period")::text
) STORED;

-- Та же коллация, что и у students/individuals (см. 20260812213038_ru_collation,
-- 20260813193000_individuals_ru_collation) — дефолтная en_US.utf8 сортирует "Ё" раньше "А".
ALTER TABLE "citizenships" ALTER COLUMN "country" TYPE TEXT COLLATE "ru-RU-x-icu";
