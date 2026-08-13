-- Та же проблема, что решали для students (см. 20260812213038_ru_collation):
-- дефолтная коллация базы (en_US.utf8) сортирует "Ё" (U+0401) раньше "А" (U+0410).
-- ru-RU-x-icu — родная для этого образа Postgres ICU-коллация с правильным
-- русским алфавитным порядком. Применяем к тем же полям, что участвуют в ORDER BY
-- (см. SORTABLE_FIELDS в individuals.controller.ts).
ALTER TABLE "individuals" ALTER COLUMN "full_name" TYPE TEXT COLLATE "ru-RU-x-icu";
ALTER TABLE "individuals" ALTER COLUMN "code" TYPE TEXT COLLATE "ru-RU-x-icu";
ALTER TABLE "individuals" ALTER COLUMN "snils" TYPE TEXT COLLATE "ru-RU-x-icu";
ALTER TABLE "individuals" ALTER COLUMN "inn" TYPE TEXT COLLATE "ru-RU-x-icu";
ALTER TABLE "individuals" ALTER COLUMN "gender" TYPE TEXT COLLATE "ru-RU-x-icu";
